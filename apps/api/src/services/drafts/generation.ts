import { env } from '@/config/env'
import { pickModel } from '@/lib/pick-model'
import type { ResolvedProvider } from '@/lib/provider-resolver'
import { DraftFailure, providerFailure } from './failure'

/**
 * Satu panggilan ke provider AI untuk meminta naskah draf - tanpa tool, tanpa
 * Hono. Berbeda dari AI Chat yang menyalurkan token ke browser, di sini tidak
 * ada yang menonton: pemanggil sudah pulang membawa tautannya.
 *
 * Naskahnya tetap diminta sebagai stream, tapi bukan untuk diteruskan ke mana
 * pun - hanya supaya panjang yang sudah masuk bisa dilaporkan sebagai kemajuan.
 * Tanpa itu, satu-satunya kabar selama beberapa menit adalah "sedang ditulis".
 */

const TEMPERATURE = 0.6

/**
 * Draf panjang wajar memakan waktu; batas ini hanya mencegah satu permintaan
 * menggantung selamanya dan menahan koneksinya.
 */
const REQUEST_TIMEOUT_MS = 5 * 60_000

export interface ProviderConfig {
	baseUrl: string
	apiKey: string
	model: string
}

/** Dipanggil setiap kali sepotong naskah masuk, dengan panjang total sejauh ini. */
export type ProgressReporter = (characters: number) => void

/**
 * Bagian ReadableStream yang benar-benar dipakai. Tipe bawaan `Response.body`
 * berbeda antara lib DOM dan Bun; yang dibutuhkan cuma pembacanya - sama
 * seperti `ByteSource` di jalur stream AI Chat.
 */
interface ByteSource {
	getReader(): {
		read(): Promise<{ done: boolean; value?: Uint8Array }>
		releaseLock(): void
	}
}

/**
 * Provider dari admin-ppe didahulukan, nilai env dipakai sebagai cadangan -
 * aturan yang sama dengan AI Chat. Null berarti tidak ada kredensial sama
 * sekali, dan pemanggil membalas 503.
 */
export function providerConfig(
	provider: ResolvedProvider | null,
	requestedModel?: string,
): ProviderConfig | null {
	const baseUrl = provider?.baseUrl || env.AI_BASE_URL
	const apiKey = provider?.apiKey || env.AI_API_KEY
	if (!baseUrl || !apiKey) return null

	// Aturan pemilihan model dipinjam dari AI Chat, bukan ditulis ulang: dua
	// tempat yang memutuskan sendiri berarti pengguna mendapat model berbeda
	// tergantung pintu mana yang ia masuki.
	return { baseUrl, apiKey, model: pickModel(requestedModel, provider?.modelId || env.AI_MODEL, baseUrl) }
}

export async function generateDraftMarkdown(
	config: ProviderConfig,
	messages: Array<{ role: string; content: string }>,
	onProgress?: ProgressReporter,
): Promise<string> {
	const streamed = await callProvider(config, messages, true)

	// Provider yang tidak mengenal `stream` menolaknya di depan, bukan di
	// tengah naskah. Satu percobaan ulang tanpa stream lebih baik daripada
	// memaksa seluruh fitur bergantung pada dukungan yang tidak universal -
	// kemajuannya saja yang hilang.
	if (!streamed.ok && streamed.status >= 400 && streamed.status < 500) {
		const detail = await streamed.text().catch(() => '')
		const whole = await callProvider(config, messages, false)
		if (!whole.ok) throw providerFailure(streamed.status, detail)

		return unwrapFence(requireMarkdown(await readWholeMarkdown(whole)))
	}

	if (!streamed.ok || !streamed.body) {
		throw providerFailure(streamed.status, await streamed.text().catch(() => ''))
	}

	return unwrapFence(requireMarkdown(await readStreamedMarkdown(streamed.body, onProgress)))
}

function callProvider(
	{ baseUrl, apiKey, model }: ProviderConfig,
	messages: Array<{ role: string; content: string }>,
	stream: boolean,
): Promise<Response> {
	return fetch(`${baseUrl.replace(/\/$/, '')}/chat/completions`, {
		method: 'POST',
		headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
		body: JSON.stringify({ model, temperature: TEMPERATURE, messages, ...(stream ? { stream: true } : {}) }),
		signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
	})
}

async function readWholeMarkdown(response: Response): Promise<string> {
	const payload = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> }
	return payload.choices?.[0]?.message?.content ?? ''
}

/**
 * SSE gaya OpenAI: satu peristiwa per baris `data:`, ditutup `[DONE]`.
 * Potongan yang tidak bisa dibaca dilewati - satu baris rusak tidak boleh
 * menjatuhkan naskah yang sudah terkumpul.
 */
async function readStreamedMarkdown(body: ByteSource, onProgress?: ProgressReporter): Promise<string> {
	const reader = body.getReader()
	const decoder = new TextDecoder()
	let buffer = ''
	let markdown = ''

	try {
		while (true) {
			const { done, value } = await reader.read()
			if (done) break

			buffer += decoder.decode(value, { stream: true })
			const events = buffer.split('\n\n')
			buffer = events.pop() ?? ''

			for (const event of events) {
				const piece = deltaContent(event)
				if (!piece) continue

				markdown += piece
				onProgress?.(markdown.length)
			}
		}
	} finally {
		reader.releaseLock()
	}

	return markdown
}

function deltaContent(event: string): string {
	for (const line of event.split('\n')) {
		if (!line.startsWith('data:')) continue

		const payload = line.slice(5).trim()
		if (!payload || payload === '[DONE]') continue

		try {
			const parsed = JSON.parse(payload) as { choices?: Array<{ delta?: { content?: string } }> }
			const content = parsed.choices?.[0]?.delta?.content
			if (content) return content
		} catch {
			// Potongan JSON yang belum utuh: dilewati, sisanya menyusul di event berikutnya.
		}
	}
	return ''
}

function requireMarkdown(markdown: string): string {
	const trimmed = markdown.trim()
	if (!trimmed) throw new DraftFailure('empty_response', 'Provider AI mengembalikan naskah kosong.')
	return trimmed
}

/**
 * Pagar yang berarti "seluruh jawaban terbungkus", bukan pagar yang isinya
 * memang kode.
 *
 * Bahasanya dibatasi dengan sengaja. Dulu pola ini menerima bahasa apa pun,
 * dan itu justru menelan satu-satunya bentuk jawaban yang benar untuk
 * rancangan satu halaman: model menurut, membalas dengan tepat satu pagar
 * ```html, lalu pagarnya dilucuti di sini - sebelum `markdownToDoc` sempat
 * mengenalinya. Yang tersisa HTML mentah tanpa penanda, dan ia mendarat di
 * kanvas sebagai paragraf demi paragraf berisi tag.
 */
const WRAPPER_FENCE = /^```(?:markdown|md|text|txt)?\n([\s\S]*)\n```$/i

/**
 * Sebagian model tetap membungkus seluruh jawaban dalam satu pagar ```markdown
 * meski diminta tidak. Dibiarkan, seluruh dokumen masuk sebagai satu blok kode.
 */
function unwrapFence(markdown: string): string {
	const match = WRAPPER_FENCE.exec(markdown)
	return match ? match[1] : markdown
}
