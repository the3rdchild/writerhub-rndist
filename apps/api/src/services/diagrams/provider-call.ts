import { speaksOpenRouter } from '@/lib/speaks-openrouter'
import type { ProviderConfig } from '@/services/drafts/generation'

/**
 * Satu panggilan sub-agent penggambar, dialirkan.
 *
 * Dulu satu `fetch` biasa dengan batas 90 detik. Putaran uji 28 Sep: 24 dari
 * 46 permintaan gambar gagal, 15 di antaranya tepat di detik ke-90. Batasnya
 * pun tidak terlihat sebagai batas: OpenRouter mengirim header lebih dulu,
 * pembacaan isinya yang terpotong, dan `json().catch()` menelannya menjadi
 * "tidak ada gambar" - model tidak bisa membedakannya dari SVG yang cacat.
 *
 * Dialirkan, diamnya koneksi bisa dibedakan dari model yang masih bekerja:
 * setiap potongan - termasuk penalaran dan komentar keep-alive - mengulang
 * hitungan jeda, dan batas total tetap menjaga permintaan yang tidak pernah
 * selesai.
 */

export type SubAgentFailure = 'timeout' | 'rejected' | 'empty'

export type SubAgentReply =
	| { ok: true; content: string }
	| { ok: false; failure: SubAgentFailure; detail: string }

export interface SubAgentCall {
	temperature: number
	/**
	 * Penalaran model. Menggambar adalah menulis koordinat dari tata bahasa yang
	 * sudah lengkap; diukur 28 Sep, penalaran memakan 86% token keluaran Flash
	 * dan 44 dari 48 detik satu bar chart.
	 */
	reasoning: boolean
	/** Tanpa satu potongan pun selama ini: koneksi dianggap mati. */
	idleMs: number
	/** Batas atas satu panggilan, sepanjang apa pun alirannya. */
	totalMs: number
	/** Dipakai uji; bawaannya `fetch` global. */
	fetch?: typeof fetch
}

/** Hanya OpenRouter (dan proksinya) yang mengenal saklar `reasoning`; provider lain bisa menolaknya. */
function reasoningField(baseUrl: string, reasoning: boolean): Record<string, unknown> {
	return !reasoning && speaksOpenRouter(baseUrl) ? { reasoning: { enabled: false } } : {}
}

function contentOf(event: string): string {
	let text = ''
	for (const line of event.split('\n')) {
		if (!line.startsWith('data:')) continue
		const payload = line.slice(5).trim()
		if (!payload || payload === '[DONE]') continue
		try {
			const parsed = JSON.parse(payload) as { choices?: Array<{ delta?: { content?: string | null } }> }
			text += parsed.choices?.[0]?.delta?.content ?? ''
		} catch {
			// Potongan yang tidak terbaca dilewati; satu baris rusak tidak menjatuhkan gambar.
		}
	}
	return text
}

export async function streamCompletion(
	{ baseUrl, apiKey, model }: ProviderConfig,
	messages: Array<{ role: string; content: string }>,
	call: SubAgentCall,
): Promise<SubAgentReply> {
	const controller = new AbortController()
	let reason: 'idle' | 'total' | null = null
	const stop = (why: 'idle' | 'total') => {
		reason ??= why
		controller.abort()
	}
	const timedOut = (): SubAgentReply => {
		const seconds = Math.round((reason === 'idle' ? call.idleMs : call.totalMs) / 1000)
		return {
			ok: false,
			failure: 'timeout',
			detail: reason === 'idle' ? `no response for ${seconds} s` : `not finished within ${seconds} s`,
		}
	}
	const total = setTimeout(() => stop('total'), call.totalMs)
	let idle = setTimeout(() => stop('idle'), call.idleMs)
	const touch = () => {
		clearTimeout(idle)
		idle = setTimeout(() => stop('idle'), call.idleMs)
	}

	try {
		const response = await (call.fetch ?? fetch)(`${baseUrl.replace(/\/$/, '')}/chat/completions`, {
			method: 'POST',
			headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
			body: JSON.stringify({
				model,
				temperature: call.temperature,
				messages,
				stream: true,
				...reasoningField(baseUrl, call.reasoning),
			}),
			signal: controller.signal,
		})
		if (!response.ok || !response.body) {
			return { ok: false, failure: 'rejected', detail: `HTTP ${response.status}` }
		}

		// Provider yang mengabaikan `stream` menjawab JSON utuh.
		if (response.headers.get('content-type')?.includes('application/json')) {
			const payload = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> }
			const content = payload.choices?.[0]?.message?.content ?? ''
			return content.trim() ? { ok: true, content } : { ok: false, failure: 'empty', detail: 'empty reply' }
		}

		const reader = response.body.getReader()
		// Pembacaan yang sedang menunggu ikut dihentikan, bukan dibiarkan menggantung.
		controller.signal.addEventListener('abort', () => void reader.cancel().catch(() => {}))
		const decoder = new TextDecoder()
		let buffer = ''
		let content = ''
		try {
			for (;;) {
				const { done, value } = await reader.read()
				if (done) break
				touch()
				buffer += decoder.decode(value, { stream: true })
				const events = buffer.split('\n\n')
				buffer = events.pop() ?? ''
				for (const event of events) content += contentOf(event)
			}
			content += contentOf(buffer)
		} finally {
			reader.releaseLock()
		}
		// Aliran yang dihentikan batas waktu bukan gambar utuh, sepanjang apa pun isinya.
		if (reason) return timedOut()
		return content.trim() ? { ok: true, content } : { ok: false, failure: 'empty', detail: 'empty reply' }
	} catch (error) {
		if (reason) return timedOut()
		return { ok: false, failure: 'rejected', detail: error instanceof Error ? error.message : String(error) }
	} finally {
		clearTimeout(total)
		clearTimeout(idle)
	}
}
