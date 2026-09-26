import { describe, expect, test } from 'bun:test'
import type { ChatStreamEvent } from '@writer-hub/shared'
import { openChatStream, rejectsTools } from './stream'

function body(lines: unknown[]): Response {
	const text = lines.map((line) => `data: ${JSON.stringify(line)}\n\n`).join('')
	return new Response(text)
}

async function collect(stream: ReadableStream<Uint8Array>): Promise<ChatStreamEvent[]> {
	const text = await new Response(stream).text()
	return text
		.split('\n\n')
		.map((line) => line.replace(/^data:\s*/, ''))
		.filter(Boolean)
		.map((payload) => JSON.parse(payload) as ChatStreamEvent)
}

describe('rejectsTools - hanya penolakan yang memang soal alat', () => {
	test.each([
		[400, 'This model does not support tools'],
		[404, 'No endpoints found that support tool use. Try disabling "tools".'],
		[400, 'tool calling is not supported for this model'],
		[422, "Unsupported parameter: 'tools'"],
	])('%p %p', (status, detail) => {
		expect(rejectsTools(status, detail)).toBe(true)
	})

	test.each([
		[400, "Messages with role 'tool' must be a response to a preceding message with 'tool_calls'"],
		[400, "An assistant message with 'tool_calls' must be followed by tool messages"],
		[402, 'Insufficient credits. This model does not support tools'],
		[429, 'Rate limit exceeded'],
		[401, 'Invalid API key'],
		[500, 'does not support tools'],
	])('bukan: %p %p', (status, detail) => {
		expect(rejectsTools(status, detail)).toBe(false)
	})
})

describe('openChatStream - coba ulang tanpa alat', () => {
	test('percakapan cacat tidak mematikan alat; galatnya diteruskan apa adanya', async () => {
		const calls: boolean[] = []
		const call = async (withTools: boolean) => {
			calls.push(withTools)
			return new Response(
				"Messages with role 'tool' must be a response to a preceding message with 'tool_calls'",
				{
					status: 400,
				},
			)
		}
		const events = await collect(openChatStream(call, true))
		expect(calls).toEqual([true])
		expect(events.some((event) => event.type === 'tools_unsupported')).toBe(false)
		const error = events.find((event) => event.type === 'error')
		expect(error && 'message' in error ? error.message : '').toContain("role 'tool'")
	})

	test('model tanpa dukungan alat dicoba ulang tanpa alat', async () => {
		const calls: boolean[] = []
		const call = async (withTools: boolean) => {
			calls.push(withTools)
			return withTools
				? new Response('No endpoints found that support tool use.', { status: 404 })
				: body([{ choices: [{ delta: { content: 'Halo.' } }] }])
		}
		const events = await collect(openChatStream(call, true))
		expect(calls).toEqual([true, false])
		expect(events.some((event) => event.type === 'tools_unsupported')).toBe(true)
	})

	test('saldo habis (402) dibaca sebagai kuota, bukan penolakan alat', async () => {
		const events = await collect(
			openChatStream(async () => new Response('Insufficient credits', { status: 402 }), true),
		)
		expect(events.some((event) => event.type === 'tools_unsupported')).toBe(false)
		expect(events.find((event) => event.type === 'error')).toMatchObject({ code: 'quota_exceeded' })
	})
})

describe('openChatStream - alasan berhenti', () => {
	test('finish_reason diteruskan di event done', async () => {
		const call = async () =>
			body([
				{ choices: [{ delta: { content: 'Bab dua ' } }] },
				{ choices: [{ delta: { content: 'terpotong' }, finish_reason: 'length' }] },
			])
		const events = await collect(openChatStream(call, false))
		expect(events.at(-1)).toEqual({ type: 'done', finish: 'length' })
	})

	test('tanpa finish_reason, done tetap polos', async () => {
		const call = async () => body([{ choices: [{ delta: { content: 'Halo.' } }] }])
		const events = await collect(openChatStream(call, false))
		expect(events.at(-1)).toEqual({ type: 'done' })
	})
})
