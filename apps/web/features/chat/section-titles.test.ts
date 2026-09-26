import { describe, expect, test } from 'bun:test'
import { promoteSectionTitles } from './section-titles'

/* Keluaran model di test-baru.docx, 26 Sep: judul bagian sebagai paragraf polos. */
describe('judul bagian karya ilmiah', () => {
	test('baris judul yang berdiri sendiri menjadi judul tingkat 1', () => {
		expect(promoteSectionTitles('KATA PENGANTAR\n\nPuji syukur.\n\n**ABSTRAK**\n\nIsi.')).toBe(
			'# KATA PENGANTAR\n\nPuji syukur.\n\n# ABSTRAK\n\nIsi.',
		)
		for (const title of [
			'DAFTAR ISI',
			'Daftar Pustaka',
			'ABSTRACT',
			'LAMPIRAN A DIAGRAM ALIR',
			'BAB II TINJAUAN PUSTAKA',
		]) {
			expect(promoteSectionTitles(`Teks.\n\n${title}\n\nIsi.`)).toBe(`Teks.\n\n# ${title}\n\nIsi.`)
		}
	})

	test('"BAB I" lalu judulnya di baris berikut menjadi satu judul', () => {
		expect(promoteSectionTitles('BAB I\nPENDAHULUAN\n\nLatar belakang.')).toBe(
			'# BAB I PENDAHULUAN\n\nLatar belakang.',
		)
	})

	test('kalimat, baris di tengah paragraf, heading, dan blok kode tidak disentuh', () => {
		const untouched = [
			'Lampiran ini berisi data mentah penelitian yang dikumpulkan selama tiga bulan.',
			'Bab I menjelaskan latar belakang.',
			'Paragraf pertama.\nDaftar Isi\nlanjutan paragraf.',
			'## Daftar Pustaka',
			'```\nDAFTAR ISI\n```',
		]
		for (const text of untouched) expect(promoteSectionTitles(text)).toBe(text)
	})
})
