import { describe, expect, test } from 'bun:test'
import type { ChatBody } from './dto'
import { buildMessages } from './messages'

function body(over: Partial<ChatBody> = {}): ChatBody {
	return {
		messages: [{ role: 'user', content: 'halo' }],
		tools: true,
		research: false,
		...over,
	} as ChatBody
}

describe('penyusunan pesan provider', () => {
	test('pesan sistem selalu berada paling depan', () => {
		const [first] = buildMessages(body(), true, null) as { role: string }[]

		expect(first.role).toBe('system')
	})

	test('konteks editor disisipkan sebelum percakapan pengguna', () => {
		const messages = buildMessages(
			body({ context: { title: 'Skripsi', selection: 'kalimat ini' } }),
			true,
			null,
		) as { role: string; content: string }[]

		expect(messages).toHaveLength(3)
		expect(messages[1].role).toBe('user')
		expect(messages[1].content).toContain('[Editor context]')
		expect(messages[1].content).toContain('Document title: Skripsi')
		expect(messages[1].content).toContain('kalimat ini')
		expect(messages[2].content).toBe('halo')
	})

	test('tanpa konteks, tidak ada pesan tambahan yang diselipkan', () => {
		const messages = buildMessages(body(), true, null)

		expect(messages).toHaveLength(2)
	})

	test('isi dokumen menang atas teks sekitar', () => {
		// Keduanya menjelaskan hal yang sama pada tingkat kedalaman berbeda;
		// mengirim dua-duanya hanya memboroskan jendela konteks.
		const messages = buildMessages(
			body({ context: { document: 'garis besar', surrounding: 'paragraf sekitar' } }),
			true,
			null,
		) as { content: string }[]

		expect(messages[1].content).toContain('garis besar')
		expect(messages[1].content).not.toContain('paragraf sekitar')
	})

	test('balasan tool membawa tool_call_id, bukan role biasa', () => {
		const messages = buildMessages(
			body({
				messages: [
					{ role: 'user', content: 'cari' },
					{ role: 'tool', content: '{"ok":true}', toolCallId: 'call_1' },
				],
			}),
			true,
			null,
		) as Record<string, unknown>[]

		expect(messages[2]).toEqual({ role: 'tool', tool_call_id: 'call_1', content: '{"ok":true}' })
	})

	test('tool call asisten diterjemahkan ke bentuk function provider', () => {
		const messages = buildMessages(
			body({
				messages: [
					{
						role: 'assistant',
						content: '',
						toolCalls: [{ id: 'call_1', name: 'web_search', arguments: '{"q":"a"}' }],
					},
				],
			}),
			true,
			null,
		) as Record<string, unknown>[]

		expect(messages[1]).toEqual({
			role: 'assistant',
			content: null,
			tool_calls: [
				{ id: 'call_1', type: 'function', function: { name: 'web_search', arguments: '{"q":"a"}' } },
			],
		})
	})
})
