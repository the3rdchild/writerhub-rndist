import type { ChatStreamEvent } from '@writer-hub/shared'

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

export function openChatStream(
	call: (withTools: boolean) => Promise<Response>,
	wantsTools: boolean,
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
				if (wantsTools && !upstream.ok && upstream.status >= 400 && upstream.status < 500) {
					send({ type: 'status', phase: 'retrying', detail: 'Provider menolak tool calling' })
					send({ type: 'tools_unsupported' })
					upstream = await call(false)
				}

				if (!upstream.ok || !upstream.body) {
					const detail = await upstream.text().catch(() => '')
					const credentialsRejected = upstream.status === 401 || upstream.status === 403
					send({
						type: 'error',
						message: credentialsRejected
							? 'Kunci API provider AI ditolak - periksa AI_API_KEY'
							: `Provider AI membalas ${upstream.status}. ${detail.slice(0, 300)}`.trim(),
					})
					return
				}

				send({ type: 'status', phase: 'thinking' })
				await pumpUpstream(upstream.body, send)
				send({ type: 'done' })
			} catch (error) {
				send({ type: 'error', message: error instanceof Error ? error.message : 'Stream terputus' })
			} finally {
				clearInterval(ping)
				closed = true
				controller.close()
			}
		},
	})
}

async function pumpUpstream(body: ByteSource, send: (event: ChatStreamEvent) => void): Promise<void> {
	const decoder = new TextDecoder()
	const reader = body.getReader()
	let buffer = ''
	const pending = new Map<number, PartialToolCall>()
	let phase: 'thinking' | 'reading' | 'writing' = 'thinking'

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

					const text = delta?.content
					if (typeof text === 'string' && text.length > 0) {
						if (phase !== 'writing') {
							phase = 'writing'
							send({ type: 'status', phase })
						}
						send({ type: 'delta', text })
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
				arguments: call.arguments || '{}',
			})
		}
	} finally {
		reader.releaseLock()
	}
}
