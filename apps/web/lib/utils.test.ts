import { describe, expect, test } from 'bun:test'
import { countCharacters, countWords, formatTextCounts } from './utils'

describe('hitungan kata dan karakter (TKS-22)', () => {
	test('tanda pisah dan butir bukan kata', () => {
		expect(countWords('Satu — dua - tiga • empat')).toBe(4)
		expect(countWords('  ')).toBe(0)
		expect(countWords('Rp10.000 dan 2,5 kg')).toBe(4)
	})

	test('pemisah blok tidak dihitung sebagai karakter', () => {
		expect(countCharacters('ab cd\n\n\nef')).toBe(7)
		expect(countCharacters('')).toBe(0)
	})
})

describe('formatTextCounts', () => {
	test('bentuk tunggal untuk satu kata atau satu karakter', () => {
		expect(formatTextCounts('a')).toBe('1 word · 1 character')
		expect(formatTextCounts('dua kata')).toBe('2 words · 8 characters')
		expect(formatTextCounts('')).toBe('0 words · 0 characters')
	})
})
