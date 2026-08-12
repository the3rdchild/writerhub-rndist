import { describe, expect, test } from 'bun:test'
import type { ChatTurn } from './chat-context'
import { buildOutboundMessages } from './chat-context'

/**
 * Pemadatan batas tugas (B2 M2).
 *
 * Bug yang diperbaiki: seluruh riwayat dikirim ulang apa adanya, termasuk
 * pesan `tool` dan `tool_calls` dari giliran-giliran lama. Bagi model,
 * permintaan alat yang belum berbuah hasil terbaca sebagai pekerjaan yang
 * belum selesai, lalu ia meneruskannya ke tugas baru. Pemadatan membuang
 * rincian alat tugas lama dan hanya menyimpan teks pertanyaan/jawabannya.
 */

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

describe('buildOutboundMessages — pemadatan batas tugas', () => {
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
			// Pengguna membuka tugas baru.
			user('buat tabel', TASK_B),
		]

		const outbound = buildOutboundMessages(history, TASK_B)

		// Tugas A: hanya teks pengguna + jawaban asisten, tanpa pesan tool
		// dan tanpa tool_calls dari giliran yang meminta alat baca.
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
			assistant('', TASK_A), // giliran terminal kosong (penanda M6) — buang saat dikirim
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

		// `actions` adalah bidang milik UI; pastikan tidak ikut keluar meski
		// tugasnya sedang berjalan.
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
})
