import { env } from '@/config/env'
import type { ResolvedProvider } from '@/lib/provider-resolver'

/**
 * Satu panggilan ke provider AI untuk meminta naskah draf - tanpa stream,
 * tanpa tool, tanpa Hono. Berbeda dari AI Chat yang menyalurkan token ke
 * browser, di sini tidak ada yang menonton: pemanggil sudah pulang membawa
 * tautannya, dan yang dibutuhkan cuma naskah utuhnya.
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

/**
 * Provider dari admin-ppe didahulukan, nilai env dipakai sebagai cadangan -
 * aturan yang sama dengan AI Chat. Null berarti tidak ada kredensial sama
 * sekali, dan pemanggil membalas 503.
 */
export function providerConfig(provider: ResolvedProvider | null): ProviderConfig | null {
	const baseUrl = provider?.baseUrl || env.AI_BASE_URL
	const apiKey = provider?.apiKey || env.AI_API_KEY
	if (!baseUrl || !apiKey) return null

	return { baseUrl, apiKey, model: provider?.modelId || env.AI_MODEL }
}

export async function generateDraftMarkdown(
	{ baseUrl, apiKey, model }: ProviderConfig,
	messages: Array<{ role: string; content: string }>,
): Promise<string> {
	const response = await fetch(`${baseUrl.replace(/\/$/, '')}/chat/completions`, {
		method: 'POST',
		headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
		body: JSON.stringify({ model, temperature: TEMPERATURE, messages }),
		signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
	})

	if (!response.ok) {
		const detail = await response.text().catch(() => '')
		throw new Error(`Provider AI membalas ${response.status}. ${detail.slice(0, 300)}`.trim())
	}

	const payload = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> }
	const markdown = payload.choices?.[0]?.message?.content?.trim()
	if (!markdown) throw new Error('Provider AI mengembalikan naskah kosong')

	return unwrapFence(markdown)
}

/**
 * Sebagian model tetap membungkus seluruh jawaban dalam satu pagar ```markdown
 * meski diminta tidak. Dibiarkan, seluruh dokumen masuk sebagai satu blok kode.
 */
function unwrapFence(markdown: string): string {
	const match = /^```[a-z]*\n([\s\S]*)\n```$/i.exec(markdown)
	return match ? match[1] : markdown
}
