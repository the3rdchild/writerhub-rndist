import { describe, expect, test } from 'bun:test'
import type { ChatStreamEvent } from '@writer-hub/shared'
import { openChatStream } from './stream'

/** Sumber SSE palsu: tiap untai dikirim sebagai satu bacaan stream. */
function fakeBody(chunks: string[]): Response {
	const encoder = new TextEncoder()
	let i = 0
	return new Response(
		new ReadableStream<Uint8Array>({
			pull(controller) {
				if (i < chunks.length) controller.enqueue(encoder.encode(chunks[i++]))
				else controller.close()
			},
		}),
	)
}

function sse(...deltas: string[]): string {
	return deltas
		.map((text) => `data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\n`)
		.join('')
}

async function collect(stream: ReadableStream<Uint8Array>): Promise<ChatStreamEvent[]> {
	const decoder = new TextDecoder()
	const reader = stream.getReader()
	const events: ChatStreamEvent[] = []
	let buffer = ''
	while (true) {
		const { done, value } = await reader.read()
		if (done) break
		buffer += decoder.decode(value, { stream: true })
		const lines = buffer.split('\n\n')
		buffer = lines.pop() ?? ''
		for (const line of lines) {
			const payload = line.replace(/^data:\s*/, '')
			if (payload) events.push(JSON.parse(payload) as ChatStreamEvent)
		}
	}
	return events
}

describe('penjaga dash pada aliran chat', () => {
	test('delta prosa dibersihkan dan tetap mengalir', async () => {
		const call = async () => fakeBody([sse('Cepat — sangat cepat.')])
		const events = await collect(openChatStream(call, false, { dashGuard: true }))
		const text = events
			.filter((event): event is { type: 'delta'; text: string } => event.type === 'delta')
			.map((event) => event.text)
			.join('')

		expect(text).toBe('Cepat, sangat cepat.')
		expect(events.at(-1)?.type).toBe('done')
	})

	test('rentang angka yang terpotong antar delta tetap utuh', async () => {
		const call = async () => fakeBody([sse('periode 2019', ' — 20', '20 aktif — penuh.')])
		const events = await collect(openChatStream(call, false, { dashGuard: true }))
		const text = events
			.filter((event): event is { type: 'delta'; text: string } => event.type === 'delta')
			.map((event) => event.text)
			.join('')

		expect(text).toBe('periode 2019–2020 aktif, penuh.')
	})

	test('argumen tool call dibersihkan sebagai nilai JSON', async () => {
		const args = JSON.stringify({ markdown: '# Judul — Pembuka\n\nIsi — dengan dash.' })
		const toolChunk = `data: ${JSON.stringify({
			choices: [
				{
					delta: {
						tool_calls: [{ index: 0, id: 'c1', function: { name: 'insert_content', arguments: args } }],
					},
				},
			],
		})}\n\n`
		const call = async () => fakeBody([toolChunk])
		const events = await collect(openChatStream(call, true, { dashGuard: true }))
		const toolCall = events.find((event) => event.type === 'tool_call') as
			| { type: 'tool_call'; arguments: string }
			| undefined

		expect(toolCall).toBeDefined()
		const parsed = JSON.parse(toolCall?.arguments ?? '{}') as { markdown: string }
		expect(parsed.markdown).toBe('# Judul, Pembuka\n\nIsi, dengan dash.')
	})

	test('tanpa dashGuard, keluaran tidak disentuh', async () => {
		const call = async () => fakeBody([sse('Cepat — sangat cepat.')])
		const events = await collect(openChatStream(call, false))
		const text = events
			.filter((event): event is { type: 'delta'; text: string } => event.type === 'delta')
			.map((event) => event.text)
			.join('')

		expect(text).toBe('Cepat — sangat cepat.')
	})
})
