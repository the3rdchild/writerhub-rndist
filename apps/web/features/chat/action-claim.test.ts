import { describe, expect, test } from 'bun:test'
import type { ToolCall } from '@writer-hub/shared'
import { type ChatTurn, unclaimedActions } from './chat-context'

const call = (id: string): ToolCall => ({ id, name: 'draw_diagram', arguments: {} })

describe('aksi tidak diterapkan dua kali', () => {
	test('yang sedang berjalan dan yang sudah diputuskan dilewati', () => {
		const history: ChatTurn[] = [
			{ role: 'tool', content: 'Diagram inserted.', toolCallId: 'selesai', taskId: 't' },
			{ role: 'tool', content: 'The writer skipped this action.', toolCallId: 'dilewati', taskId: 't' },
		]
		const calls = ['baru', 'berjalan', 'selesai', 'dilewati'].map(call)

		expect(unclaimedActions(calls, new Set(['berjalan']), history).map((item) => item.id)).toEqual(['baru'])
	})

	test('klik kedua saat yang pertama masih menggambar tidak mendapat apa pun', () => {
		const running = new Set<string>()
		const first = unclaimedActions([call('a'), call('b')], running, [])
		for (const item of first) running.add(item.id)

		expect(first.map((item) => item.id)).toEqual(['a', 'b'])
		expect(unclaimedActions([call('a'), call('b')], running, [])).toEqual([])
	})
})
