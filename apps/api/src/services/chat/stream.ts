import type { ChatStreamEvent } from '@writer-hub/shared'
import { sanitizeAIDashes, sanitizeToolArguments } from '@writer-hub/shared'
import { chatProviderFailure, toChatFailure } from './failure'

/**
 * Menerjemahkan SSE gaya OpenAI dari provider menjadi ChatStreamEvent milik
 * kita. Tidak menyentuh Hono maupun basis data - masukannya hanya sebuah
 * fungsi pemanggil dan keluarannya sebuah ReadableStream.
 */

/** Bagian kecil ReadableStream yang benar-benar dipakai, agar mudah dipalsukan saat uji. */
export interface ByteSource {
	getReader(): {
		read(): Promise<{ done: boolean; value?: Uint8Array }>
		releaseLock(): void
	}
}

/** Tool call tiba terpotong-potong antar chunk dan dirakit per indeks. */
export interface PartialToolCall {
	id: string
	name: string
	arguments: string
}

export const PING_INTERVAL_MS = 15_000

/*
 * Penolakan yang memang soal tool calling: model tanpa dukungan alat, atau
 * rute OpenRouter yang tidak punya endpoint beralat. Hanya ini yang layak
 * dicoba ulang tanpa alat.
 *
 * Dulu setiap 4xx dianggap begitu. Percakapan yang cacat ("messages with role
 * 'tool' must be a response to a preceding message with 'tool_calls'"), saldo
 * habis (402), atau rate limit (429) ikut membuat klien mematikan alat untuk
 * sisa sesi - dan chat yang tidak bisa menyunting lagi tampak berhenti di
 * tengah jalan.
 */
const TOOLS_REJECTED =
	/(does not|doesn't|do not|not)\s+support\w*\s+(the\s+)?(tool|function)|(tool|function)[\s_-]*(use|calling|calls|choice)?\s+(is\s+|are\s+)?(not|un)\s?supported|no endpoints? found that supports? tool|unsupported\s+(parameter|field)?\s*:?\s*['"`]?(tools|tool_choice|functions)/i

export function rejectsTools(status: number, detail: string): boolean {
	if (status < 400 || status >= 500 || status === 401 || status === 402 || status === 403 || status === 429) {
		return false
	}
	return TOOLS_REJECTED.test(detail)
}

export interface ChatStreamOptions {
	/** Ganti dash prosa keluaran AI dengan koma (penjaga gaya anti-mesin). */
	dashGuard?: boolean
}

export function openChatStream(
	call: (withTools: boolean) => Promise<Response>,
	wantsTools: boolean,
	options: ChatStreamOptions = {},
): ReadableStream<Uint8Array> {
	const encoder = new TextEncoder()

	return new ReadableStream<Uint8Array>({
		async start(controller) {
			let closed = false
			const send = (event: ChatStreamEvent) => {
				if (closed) return
				controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`))
			}

			const ping = setInterval(() => send({ type: 'ping' }), PING_INTERVAL_MS)

			try {
				send({ type: 'status', phase: 'connecting' })
				let upstream = await call(wantsTools)
				// Badan galat hanya bisa dibaca sekali; ia dipakai lagi untuk pesan galatnya.
				let detail: string | null = null
				if (wantsTools && !upstream.ok) {
					detail = await upstream.text().catch(() => '')
					if (rejectsTools(upstream.status, detail)) {
						send({ type: 'status', phase: 'retrying', detail: 'Provider menolak tool calling' })
						send({ type: 'tools_unsupported' })
						upstream = await call(false)
						detail = null
					}
				}

				if (!upstream.ok || !upstream.body) {
					const text = detail ?? (await upstream.text().catch(() => ''))
					send({ type: 'error', ...chatProviderFailure(upstream.status, text) })
					return
				}

				send({ type: 'status', phase: 'thinking' })
				const finish = await pumpUpstream(upstream.body, send, options)
				send({ type: 'done', ...(finish ? { finish } : {}) })
			} catch (error) {
				// Dulu di sini `error.message` diteruskan apa adanya - dan karena
				// `DOMException` lolos cek `instanceof Error`, "The operation timed
				// out." dari timeout bawaan runtime sampai ke layar penulis.
				send({ type: 'error', ...toChatFailure(error) })
			} finally {
				clearInterval(ping)
				closed = true
				controller.close()
			}
		},
	})
}

async function pumpUpstream(
	body: ByteSource,
	send: (event: ChatStreamEvent) => void,
	options: ChatStreamOptions = {},
): Promise<string | undefined> {
	let finish: string | undefined
	const decoder = new TextDecoder()
	const reader = body.getReader()
	let buffer = ''
	const pending = new Map<number, PartialToolCall>()
	let phase: 'thinking' | 'reading' | 'writing' = 'thinking'

	/*
	 * Penjaga dash (opsional). Pembersihnya butuh konteks karakter
	 * sebelum-sesudah dash, padahal delta tiba terpotong-potong; ujung untai
	 * yang masih mungkin disambung angka atau spasi ditahan satu putaran,
	 * selebihnya langsung dibersihkan dan dikirim supaya pengalaman
	 * mengetik-hidup tidak terganggu.
	 */
	const dashGuard = options.dashGuard === true
	let carry = ''
	const flushable = (text: string): number => {
		const tail = /[ \t\d—–-]+$/.exec(text)
		return tail ? text.length - tail[0].length : text.length
	}
	const emitDelta = (raw: string, final: boolean) => {
		const combined = carry + raw
		if (final) {
			carry = ''
			send({ type: 'delta', text: sanitizeAIDashes(combined) })
			return
		}
		const cut = flushable(combined)
		if (cut <= 0) {
			carry = combined
			return
		}
		carry = combined.slice(cut)
		send({ type: 'delta', text: sanitizeAIDashes(combined.slice(0, cut)) })
	}

	try {
		while (true) {
			const { done, value } = await reader.read()
			if (done) break

			if (value) buffer += decoder.decode(value, { stream: true })
			const lines = buffer.split('\n')
			buffer = lines.pop() ?? ''

			for (const line of lines) {
				const trimmed = line.trim()
				if (!trimmed.startsWith('data:')) continue

				const payload = trimmed.slice(5).trim()
				if (payload === '[DONE]') continue

				try {
					const parsed = JSON.parse(payload)
					const delta = parsed?.choices?.[0]?.delta
					const reason = parsed?.choices?.[0]?.finish_reason
					if (typeof reason === 'string' && reason) finish = reason

					const text = delta?.content
					if (typeof text === 'string' && text.length > 0) {
						if (phase !== 'writing') {
							phase = 'writing'
							send({ type: 'status', phase })
						}
						if (dashGuard) emitDelta(text, false)
						else send({ type: 'delta', text })
					}
					const reasoning = delta?.reasoning_content ?? delta?.reasoning
					if (typeof reasoning === 'string' && reasoning.length > 0) {
						send({ type: 'reasoning', text: reasoning })
					}

					const toolCalls = delta?.tool_calls ?? []
					if (toolCalls.length > 0 && phase !== 'reading') {
						phase = 'reading'
						send({ type: 'status', phase })
					}
					for (const call of toolCalls) {
						const index: number = call.index ?? 0
						const current = pending.get(index) ?? { id: '', name: '', arguments: '' }

						if (call.id) current.id = call.id
						if (call.function?.name) current.name = call.function.name
						if (call.function?.arguments) current.arguments += call.function.arguments

						pending.set(index, current)
					}
					const usage = parsed?.usage
					if (usage) {
						send({
							type: 'usage',
							promptTokens: usage.prompt_tokens,
							completionTokens: usage.completion_tokens,
						})
					}
				} catch {}
			}
		}

		for (const call of pending.values()) {
			if (!call.name) continue
			send({
				type: 'tool_call',
				id: call.id || `call_${call.name}_${Math.random().toString(36).slice(2, 8)}`,
				name: call.name,
				arguments: dashGuard ? sanitizeToolArguments(call.arguments || '{}') : call.arguments || '{}',
			})
		}
		// Penyangga delta yang tersisa tidak boleh hilang; rentang angka di
		// ujung balasan ikut dinilai dengan konteks penuhnya di sini.
		if (dashGuard && carry) emitDelta('', true)
	} finally {
		reader.releaseLock()
	}
	return finish
}
