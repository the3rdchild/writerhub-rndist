import { describe, expect, test } from 'bun:test'
import { formatPageNumber } from '@writer-hub/shared'
import { CONTINUE_NUMBERING, formatSheetNumbers, type NumberedSheet } from './numbering'

describe('formatPageNumber', () => {
	test('desimal', () => {
		expect(formatPageNumber(1, 'decimal')).toBe('1')
		expect(formatPageNumber(35, 'decimal')).toBe('35')
	})

	test('romawi kecil dan besar', () => {
		expect(formatPageNumber(1, 'lower-roman')).toBe('i')
		expect(formatPageNumber(4, 'lower-roman')).toBe('iv')
		expect(formatPageNumber(9, 'lower-roman')).toBe('ix')
		expect(formatPageNumber(14, 'lower-roman')).toBe('xiv')
		expect(formatPageNumber(2026, 'upper-roman')).toBe('MMXXVI')
	})

	test('huruf basis-26 bijektif (A..Z, AA..)', () => {
		expect(formatPageNumber(1, 'upper-alpha')).toBe('A')
		expect(formatPageNumber(26, 'upper-alpha')).toBe('Z')
		expect(formatPageNumber(27, 'upper-alpha')).toBe('AA')
		expect(formatPageNumber(3, 'lower-alpha')).toBe('c')
	})
})

function sheet(
	index: number,
	sectionIndex: number,
	numbering?: NumberedSheet['pageNumbering'],
): NumberedSheet {
	return { index, sectionIndex, pageNumbering: numbering ?? null }
}

describe('formatSheetNumbers', () => {
	test('tanpa lembar terukur jatuh ke 1..count desimal', () => {
		expect(formatSheetNumbers([], 3)).toEqual(['1', '2', '3'])
	})

	test('satu section desimal berjalan terus', () => {
		const sheets = [0, 1, 2].map((i) => sheet(i, 0, CONTINUE_NUMBERING))
		expect(formatSheetNumbers(sheets)).toEqual(['1', '2', '3'])
	})

	test('sampul tanpa nomor: first kosong, romawi lalu arab mulai 1', () => {
		/* Bagian 0: sampul (nomor tetap dihitung — varian kosong menyembunyikannya
		 * saat render); bagian 1: romawi mulai 1; bagian 2: arab mulai 1. */
		const sheets = [
			sheet(0, 0, CONTINUE_NUMBERING),
			sheet(1, 1, { format: 'lower-roman', restart: 1 }),
			sheet(2, 1, { format: 'lower-roman', restart: 1 }),
			sheet(3, 2, { format: 'decimal', restart: 1 }),
			sheet(4, 2, { format: 'decimal', restart: 1 }),
		]
		expect(formatSheetNumbers(sheets)).toEqual(['1', 'i', 'ii', '1', '2'])
	})

	test('continue melanjutkan penghitung lintas section', () => {
		const sheets = [
			sheet(0, 0, CONTINUE_NUMBERING),
			sheet(1, 0, CONTINUE_NUMBERING),
			sheet(2, 1, CONTINUE_NUMBERING),
		]
		expect(formatSheetNumbers(sheets)).toEqual(['1', '2', '3'])
	})

	test('restart hanya sekali per pergantian section', () => {
		const rule = { format: 'decimal' as const, restart: 5 }
		const sheets = [sheet(0, 0, rule), sheet(1, 1, rule), sheet(2, 1, rule)]
		/* Lembar pembuka section menampilkan angka restart-nya sendiri (ala Word). */
		expect(formatSheetNumbers(sheets)).toEqual(['5', '5', '6'])
	})
})
