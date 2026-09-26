import { describe, expect, test } from 'bun:test'
import type { ToolCall } from '@writer-hub/shared'
import {
	actionsSettled,
	briefUpdateFromArgs,
	buildOutboundMessages,
	type ChatTurn,
	pendingAskOf,
} from './chat-context'

const TASK = 'task-a'
const ask: ToolCall = { id: 'ask-1', name: 'ask_user', arguments: { questions: [] } }
const write: ToolCall = { id: 'w-1', name: 'insert_content', arguments: { markdown: 'x' } }

const assistant = (extra: Partial<ChatTurn> = {}, taskId = TASK): ChatTurn => ({
	role: 'assistant',
	content: '',
	taskId,
	toolCalls: [{ id: ask.id, name: ask.name, arguments: '{}' }],
	asks: [ask],
	...extra,
})

const result = (id: string, extra: Partial<ChatTurn> = {}): ChatTurn => ({
	role: 'tool',
	content: 'ok',
	toolCallId: id,
	taskId: TASK,
	...extra,
})

describe('pertanyaan yang menunggu', () => {
	test('pertanyaan terakhir tugas berjalan yang belum dijawab', () => {
		const history: ChatTurn[] = [{ role: 'user', content: 'tolong', taskId: TASK }, assistant()]
		expect(pendingAskOf(history, TASK)).toEqual(ask)
	})

	test('sudah dijawab berarti tidak ada yang menunggu', () => {
		expect(pendingAskOf([assistant(), result(ask.id)], TASK)).toBeNull()
	})

	test('pertanyaan dari tugas lama tidak menahan kotak chat', () => {
		expect(pendingAskOf([assistant({}, 'task-lama')], TASK)).toBeNull()
	})
})

describe('giliran yang menahan', () => {
	test('giliran baru tuntas saat aksi dan pertanyaannya sama-sama diputuskan', () => {
		const owner = assistant({ actions: [write] })
		expect(actionsSettled([owner, result(write.id)], owner)).toBe(false)
		expect(actionsSettled([owner, result(write.id), result(ask.id)], owner)).toBe(true)
	})

	test('jawaban dan daftar pertanyaan tidak ikut terkirim ke server', () => {
		const answered = result(ask.id, { answer: { skipped: true } })
		const outbound = buildOutboundMessages([assistant(), answered], TASK)
		expect(outbound).toEqual([
			{ role: 'assistant', content: '', toolCalls: [{ id: ask.id, name: ask.name, arguments: '{}' }] },
			{ role: 'tool', content: 'ok', toolCallId: ask.id },
		])
	})
})

test('argumen update_brief yang rusak dibuang di pintu masuk', () => {
	expect(
		briefUpdateFromArgs({
			fields: [{ key: 'judul', value: 'A', evidence: 'kutipan' }, 'bukan objek', { key: 'teori' }],
			chapters: [
				{ title: 'BAB I', summary: 'x', status: 'selesai' },
				{ title: 'BAB II', status: 'aneh' },
			],
		}),
	).toEqual({
		fields: [
			{ key: 'judul', value: 'A', evidence: 'kutipan' },
			{ key: 'teori', value: '' },
		],
		chapters: [
			{ title: 'BAB I', summary: 'x', status: 'selesai' },
			{ title: 'BAB II', summary: '' },
		],
	})
	expect(briefUpdateFromArgs({})).toEqual({ fields: [], chapters: [] })
})
