import { describe, expect, test } from 'bun:test'
import { itemsToLines, linesToParagraphs, type PdfLine, type PdfTextItem } from './import-pdf'

/** Baris tubuh 11 pt, jarak baris 14, margin kiri 72, lebar penuh 450. */
function line(text: string, y: number, extra: Partial<PdfLine> = {}): PdfLine {
	return { text, x: 72, right: 522, y, fontSize: 11, page: 0, ...extra }
}

describe('impor PDF: baris menjadi paragraf (SHL-4)', () => {
	test('baris yang bersambung digabung; kata terpenggal disambung', () => {
		const paragraphs = linesToParagraphs([
			line('Penelitian ini membahas sistem infor-', 700),
			line('masi geografis untuk perencanaan', 686),
			line('evakuasi bencana.', 672, { right: 200 }),
		])
		expect(paragraphs).toEqual([
			'Penelitian ini membahas sistem informasi geografis untuk perencanaan evakuasi bencana.',
		])
	})

	test('celah besar, indentasi, dan baris pendek bertitik memulai paragraf baru', () => {
		const paragraphs = linesToParagraphs([
			line('Paragraf satu selesai di sini.', 700, { right: 300 }),
			line('Paragraf dua dimulai dengan indentasi', 686, { x: 108 }),
			line('dan berlanjut.', 672, { right: 200 }),
			line('Paragraf tiga setelah celah besar', 630),
			line('masih paragraf tiga.', 616),
		])
		expect(paragraphs).toEqual([
			'Paragraf satu selesai di sini.',
			'Paragraf dua dimulai dengan indentasi dan berlanjut.',
			'Paragraf tiga setelah celah besar masih paragraf tiga.',
		])
	})

	test('judul kapital, BAB, dan subbab bernomor berdiri sendiri; nomor halaman dibuang', () => {
		const paragraphs = linesToParagraphs([
			line('BAB III METODOLOGI PENELITIAN', 700, { right: 330 }),
			line('3.1 Model Pengembangan', 686, { right: 250 }),
			line('Penelitian ini memakai model ADDIE dan', 672),
			line('ditulis di halaman yang sama.', 658, { right: 260 }),
			line('12', 60, { x: 290, right: 300 }),
		])
		expect(paragraphs).toEqual([
			'BAB III METODOLOGI PENELITIAN',
			'3.1 Model Pengembangan',
			'Penelitian ini memakai model ADDIE dan ditulis di halaman yang sama.',
		])
	})

	test('butir daftar memulai paragraf sendiri setelah butir sebelumnya selesai', () => {
		const paragraphs = linesToParagraphs([
			line('1. Bapak Rektor, selaku pimpinan universitas.', 700),
			line('2. Bapak Dekan, selaku pimpinan fakultas.', 686),
		])
		expect(paragraphs).toEqual([
			'1. Bapak Rektor, selaku pimpinan universitas.',
			'2. Bapak Dekan, selaku pimpinan fakultas.',
		])
	})

	test('kalimat yang terpotong pergantian halaman disambung', () => {
		const paragraphs = linesToParagraphs([
			line('Kalimat ini berlanjut ke halaman', 80, { page: 0 }),
			line('berikutnya tanpa terputus.', 760, { page: 1, right: 260 }),
		])
		expect(paragraphs).toEqual(['Kalimat ini berlanjut ke halaman berikutnya tanpa terputus.'])
	})

	test('potongan pdf.js digabung per baris menurut hasEOL', () => {
		const item = (str: string, x: number, hasEOL: boolean): PdfTextItem => ({
			str,
			x,
			y: 700,
			width: str.length * 5,
			fontSize: 11,
			hasEOL,
		})
		const lines = itemsToLines([
			[item('Halo ', 72, false), item('dunia', 100, true), item('Baris dua', 72, true)],
		])
		expect(lines.map((l) => l.text)).toEqual(['Halo dunia', 'Baris dua'])
	})
})
