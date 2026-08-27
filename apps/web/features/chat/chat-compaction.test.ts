import { describe, expect, test } from 'bun:test'
import type { ChatTurn } from './chat-context'
import { actionsSettled, buildOutboundMessages } from './chat-context'
const TASK_A = 'task-a'
const TASK_B = 'task-b'

function user(text: string, taskId: string): ChatTurn {
	return { role: 'user', content: text, taskId }
}

function assistant(text: string, taskId: string, toolCalls?: ChatTurn['toolCalls']): ChatTurn {
	return { role: 'assistant', content: text, taskId, toolCalls }
}

function tool(content: string, toolCallId: string, taskId: string): ChatTurn {
	return { role: 'tool', content, toolCallId, taskId }
}

describe('buildOutboundMessages - pemadatan batas tugas', () => {
	test('tugas berjalan dikirim utuh, termasuk pesan tool dan tool_calls', () => {
		const history: ChatTurn[] = [
			user('ringkas bab 1', TASK_A),
			assistant('', TASK_A, [{ id: 'c1', name: 'get_outline', arguments: '{}' }]),
			tool('1. # Pendahuluan', 'c1', TASK_A),
		]

		const outbound = buildOutboundMessages(history, TASK_A)

		expect(outbound).toEqual([
			{ role: 'user', content: 'ringkas bab 1' },
			{ role: 'assistant', content: '', toolCalls: [{ id: 'c1', name: 'get_outline', arguments: '{}' }] },
			{ role: 'tool', content: '1. # Pendahuluan', toolCallId: 'c1' },
		])
	})

	test('tugas lama dipangkas: pesan tool dibuang, tool_calls asisten dicabut', () => {
		const history: ChatTurn[] = [
			user('ringkas bab 1', TASK_A),
			assistant('', TASK_A, [{ id: 'c1', name: 'get_outline', arguments: '{}' }]),
			tool('1. # Pendahuluan', 'c1', TASK_A),
			assistant('Ini ringkasannya.', TASK_A),
			user('buat tabel', TASK_B),
		]

		const outbound = buildOutboundMessages(history, TASK_B)
		expect(outbound).toEqual([
			{ role: 'user', content: 'ringkas bab 1' },
			{ role: 'assistant', content: 'Ini ringkasannya.' },
			{ role: 'user', content: 'buat tabel' },
		])
		expect(outbound.some((m) => m.role === 'tool')).toBe(false)
		expect(outbound.some((m) => m.toolCalls && m.toolCalls.length > 0)).toBe(false)
	})

	test('giliran asisten lama yang kosong tidak dikirim (tidak ada isinya)', () => {
		const history: ChatTurn[] = [
			user('tanya sesuatu', TASK_A),
			assistant('', TASK_A), // giliran terminal kosong (penanda M6) - buang saat dikirim
			user('tanya lagi', TASK_B),
		]

		const outbound = buildOutboundMessages(history, TASK_B)

		expect(outbound).toEqual([
			{ role: 'user', content: 'tanya sesuatu' },
			{ role: 'user', content: 'tanya lagi' },
		])
	})

	test('kartu aksi (actions) tidak pernah dikirim ke provider', () => {
		const history: ChatTurn[] = [
			user('sisipkan paragraf', TASK_A),
			assistant('Akan saya sisipkan.', TASK_A, undefined),
		]
		const withActions: ChatTurn[] = [
			...history.slice(0, -1),
			{
				...history[history.length - 1],
				actions: [{ id: 'w1', name: 'insert_content', arguments: { markdown: 'x' } }],
			},
		]

		const outbound = buildOutboundMessages(withActions, TASK_A)
		expect(outbound.every((m) => !('actions' in m))).toBe(true)
	})

	test('lini masa (steps) dan usage tidak pernah dikirim ke provider', () => {
		const history: ChatTurn[] = [
			user('ringkas bab 1', TASK_A),
			{
				...assistant('Ini ringkasannya.', TASK_A),
				steps: [{ id: 's1', label: 'Berpikir…', status: 'done', startedAt: 1, endedAt: 2 }],
				usage: { promptTokens: 100, completionTokens: 50 },
			},
		]

		const outbound = buildOutboundMessages(history, TASK_A)
		expect(outbound).toEqual([
			{ role: 'user', content: 'ringkas bab 1' },
			{ role: 'assistant', content: 'Ini ringkasannya.' },
		])
	})

	test('riwayat panjang dipangkas ke batas server, giliran tertua lebih dulu', () => {
		const history: ChatTurn[] = []
		for (let i = 0; i < 30; i++) {
			history.push(user(`pertanyaan ${i}`, `old-${i}`))
			history.push(assistant(`jawaban ${i}`, `old-${i}`))
		}
		history.push(user('pertanyaan aktif', TASK_A))
		history.push(assistant('', TASK_A, [{ id: 'c1', name: 'get_outline', arguments: '{}' }]))
		history.push(tool('1. # Pendahuluan', 'c1', TASK_A))

		const outbound = buildOutboundMessages(history, TASK_A)

		expect(outbound.length).toBeLessThanOrEqual(40)
		expect(outbound[outbound.length - 3]).toEqual({ role: 'user', content: 'pertanyaan aktif' })
		expect(outbound[outbound.length - 1].role).toBe('tool')
		expect(outbound[0].role).toBe('user')
		expect(outbound.some((m) => m.content === 'pertanyaan 0')).toBe(false)
		expect(outbound.some((m) => m.content === 'pertanyaan 29')).toBe(true)
	})
})
describe('actionsSettled - syarat melanjutkan giliran', () => {
	const write = (id: string, name: string) => ({ id, name, arguments: '{}' })

	const owner = (...ids: string[]): ChatTurn => ({
		role: 'assistant',
		content: '',
		taskId: TASK_A,
		actions: ids.map((id) => write(id, 'set_alignment')),
	})

	test('kartu tunggal: satu keputusan sudah melengkapi', () => {
		const history: ChatTurn[] = [owner('w1'), tool('Aligned justify.', 'w1', TASK_A)]
		expect(actionsSettled(history, history[0])).toBe(true)
	})

	test('kartu yang belum diputuskan menahan kelanjutan', () => {
		const history: ChatTurn[] = [owner('w1', 'w2'), tool('Aligned justify.', 'w1', TASK_A)]
		expect(actionsSettled(history, history[0])).toBe(false)
	})

	test('dilewati dihitung sebagai keputusan, sama seperti diterapkan', () => {
		const history: ChatTurn[] = [
			owner('w1', 'w2'),
			tool('Aligned justify.', 'w1', TASK_A),
			tool('The writer skipped this action.', 'w2', TASK_A),
		]
		expect(actionsSettled(history, history[0])).toBe(true)
	})

	test('giliran tanpa kartu tidak pernah menahan apa pun', () => {
		const turn: ChatTurn = { role: 'assistant', content: 'Sudah rapi.', taskId: TASK_A }
		expect(actionsSettled([turn], turn)).toBe(true)
	})

	test('riwayat lengkap lolos ke provider sebagai pasangan utuh', () => {
		const history: ChatTurn[] = [
			user('rapikan formatnya', TASK_A),
			{
				role: 'assistant',
				content: 'Mari mulai.',
				taskId: TASK_A,
				toolCalls: [write('w1', 'set_page_setup')],
				actions: [write('w1', 'set_page_setup')],
			},
			tool('Page layout set.', 'w1', TASK_A),
		]

		const outbound = buildOutboundMessages(history, TASK_A)
		const requested = outbound.flatMap((m) => m.toolCalls?.map((c) => c.id) ?? [])
		const answered = outbound.filter((m) => m.role === 'tool').map((m) => m.toolCallId)
		expect(requested).toEqual(answered as string[])
	})
})
