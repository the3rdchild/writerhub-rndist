import { describe, expect, test } from 'bun:test'
import { cssLineHeight, DEFAULT_LINE_HEIGHT, documentLineSpacing } from '@writer-hub/shared'
import { DEFAULT_LINE_SPACING, LINE_SPACING_OPTIONS } from './spacing-options'

/*
 * Menu spasi, importer DOCX, dan lembar gaya tipografi menulis ke properti CSS
 * yang sama. Ketiganya harus memakai satu perumus; kalau menu menulis angkanya
 * mentah-mentah - seperti dulu - "Tunggal" berarti `line-height: 1`, lebih
 * rapat daripada tunggal versi Word, dan naskah hasil impor tidak pernah cocok
 * dengan satu prasetel pun.
 */
describe('prasetel spasi baris', () => {
	test('nilai CSS tiap prasetel lewat cssLineHeight', () => {
		for (const option of LINE_SPACING_OPTIONS) {
			expect(option.value).toBe(String(cssLineHeight(option.spacing)))
		}
	})

	test('prasetelnya sama dengan menu Google Docs', () => {
		expect(LINE_SPACING_OPTIONS.map((option) => option.spacing)).toEqual([1, 1.15, 1.5, 2])
	})

	test('spasi tunggal Word cocok dengan prasetel "Tunggal"', () => {
		// Importer memakai perumus yang sama, jadi paragraf tunggal hasil impor
		// harus mendarat tepat di prasetel pertama.
		const single = LINE_SPACING_OPTIONS.find((option) => option.spacing === 1)
		expect(single?.value).toBe(String(cssLineHeight(240 / 240)))
	})

	test('bawaan dokumen kosong diturunkan, bukan ditulis tangan', () => {
		expect(DEFAULT_LINE_SPACING).toBe(String(cssLineHeight(DEFAULT_LINE_HEIGHT)))
	})

	test('documentLineSpacing membalik cssLineHeight untuk tiap prasetel', () => {
		for (const option of LINE_SPACING_OPTIONS) {
			expect(documentLineSpacing(Number(option.value))).toBe(option.spacing)
		}
	})
})
