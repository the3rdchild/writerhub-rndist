import { describe, expect, test } from 'bun:test'
import type { JSONContent } from '@tiptap/core'
import { buildSchema } from '@/features/sync/serialize'
import {
	continueNudge,
	emptySections,
	isContinuePrompt,
	MAX_AUTO_CONTINUES,
	mayAutoContinue,
	promisesMore,
} from './stall'

const schema = buildSchema()
const heading = (level: number, text: string): JSONContent => ({
	type: 'heading',
	attrs: { level },
	content: [{ type: 'text', text }],
})
const paragraph = (text: string): JSONContent => ({ type: 'paragraph', content: [{ type: 'text', text }] })
const doc = (...blocks: JSONContent[]) => schema.nodeFromJSON({ type: 'doc', content: blocks })

describe('promisesMore - janji langkah berikutnya tanpa mengerjakannya', () => {
	test.each([
		'Saya akan melanjutkan dengan BAB II.',
		'BAB I sudah selesai.\n\nSelanjutnya saya akan menulis BAB II Tinjauan Pustaka.',
		'Sekarang saya akan menambahkan subbab 2.2.',
		'Mari kita lanjutkan ke BAB III.',
		'Lanjut ke BAB IV.',
		"BAB I is done. I'll now continue with chapter 2.",
		'**Saya akan melanjutkan dengan BAB II.**',
	])('%p', (text) => {
		expect(promisesMore(text)).toBe(true)
	})

	test.each([
		'Apakah Anda ingin saya melanjutkan ke BAB III?',
		'Jika Anda setuju dengan outline ini, saya akan melanjutkan ke BAB I.',
		'Saya akan melanjutkan setelah Anda menyetujui outline ini.',
		'Semua bab sudah terisi. Silakan tinjau hasilnya.',
		'Beri tahu saya kalau ada bagian yang perlu diubah, saya akan memperbaikinya.',
		'Saya akan menulis lima bab: pendahuluan, tinjauan pustaka, metode, hasil, dan penutup.\n\nSemua bab sudah selesai ditulis.',
		'Selesai. Dokumen sudah lengkap.',
		'',
	])('bukan macet: %p', (text) => {
		expect(promisesMore(text)).toBe(false)
	})
})

describe('isContinuePrompt', () => {
	test.each([
		'lanjut',
		'Lanjutkan',
		'lanjutkan saja',
		'ok lanjut',
		'oke, lanjutkan!',
		'terus',
		'continue',
		'lanjut sampai selesai',
	])('%p', (text) => {
		expect(isContinuePrompt(text)).toBe(true)
	})
	test.each([
		'lanjutkan BAB III dengan gaya lebih formal',
		'kenapa berhenti?',
		'buat tabel',
		'lanjutan dari bab 2',
	])('bukan: %p', (text) => {
		expect(isContinuePrompt(text)).toBe(false)
	})
})

describe('emptySections', () => {
	test('bab yang baru judul dan subjudul dihitung kosong; daftar isi dilewati', () => {
		const result = emptySections(
			doc(
				paragraph('SKRIPSI'),
				heading(1, 'DAFTAR ISI'),
				heading(1, 'BAB I PENDAHULUAN'),
				heading(2, '1.1 Latar Belakang'),
				paragraph('Isi latar belakang.'),
				heading(1, 'BAB II TINJAUAN PUSTAKA'),
				heading(2, '2.1 Landasan Teori'),
				heading(1, 'BAB III METODE'),
				{ type: 'paragraph' },
			),
		)
		expect(result.total).toBe(3)
		expect(result.empty).toEqual(['BAB II TINJAUAN PUSTAKA', 'BAB III METODE'])
	})

	test('tabel dihitung isi', () => {
		const table: JSONContent = {
			type: 'table',
			content: [
				{
					type: 'tableRow',
					content: [{ type: 'tableCell', content: [paragraph('Data')] }],
				},
			],
		}
		expect(emptySections(doc(heading(1, 'LAMPIRAN'), table)).empty).toEqual([])
	})
})

describe('mayAutoContinue', () => {
	test('sebab yang sama tanpa kemajuan berhenti; sebab lain atau ada kemajuan lanjut; ada batasnya', () => {
		expect(mayAutoContinue(0, false, false)).toBe(true)
		expect(mayAutoContinue(1, false, true)).toBe(false)
		expect(mayAutoContinue(1, false, false)).toBe(true)
		expect(mayAutoContinue(1, true, true)).toBe(true)
		expect(mayAutoContinue(MAX_AUTO_CONTINUES, true, false)).toBe(false)
	})
})

describe('continueNudge', () => {
	test('menyebut bagian kosong sebagai acuan dan cara berhenti', () => {
		const nudge = continueNudge('wave_limit', ['BAB IV HASIL', 'BAB V PENUTUP'])
		expect(nudge.startsWith('[Continue]')).toBe(true)
		expect(nudge).toContain('BAB IV HASIL; BAB V PENUTUP')
		expect(nudge).toContain('Fill only those the request covers')
		expect(nudge).toContain('no tool calls')
	})

	test('jawaban terpotong diminta per bagian kecil', () => {
		expect(continueNudge('truncated', [])).toContain('one section per insert_content call')
		expect(continueNudge('truncated', [])).not.toContain('For reference')
	})
})
