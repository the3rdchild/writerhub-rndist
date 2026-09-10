import { describe, expect, test } from 'bun:test'
import { formatWordDelta, sumWordDeltas, wordDelta } from './word-delta'

describe('wordDelta', () => {
	test('sisipan murni hanya menambah', () => {
		expect(wordDelta('satu dua', 'satu dua tiga empat')).toEqual({ added: 2, removed: 0 })
	})

	test('hapusan murni hanya mengurangi', () => {
		expect(wordDelta('satu dua tiga', 'satu')).toEqual({ added: 0, removed: 2 })
	})

	test('penggantian dihitung dua arah', () => {
		const delta = wordDelta('bab ini membahas metode', 'bab ini menguraikan metode')
		expect(delta.added).toBe(1)
		expect(delta.removed).toBe(1)
	})

	test('naskah yang tidak berubah tidak menghasilkan angka', () => {
		expect(wordDelta('satu dua', 'satu dua')).toEqual({ added: 0, removed: 0 })
	})
})

describe('formatWordDelta', () => {
	test('perubahan nol tidak diberi label', () => {
		expect(formatWordDelta({ added: 0, removed: 0 })).toBeNull()
	})

	test('satu arah tetap menyebut keduanya, supaya bentuknya tidak berubah-ubah', () => {
		expect(formatWordDelta({ added: 12, removed: 0 })).toBe('+12 −0 kata')
	})
})

describe('sumWordDeltas', () => {
	test('daftar kosong menghasilkan nol', () => {
		expect(sumWordDeltas([])).toEqual({ added: 0, removed: 0 })
	})

	test('beberapa aksi dijumlahkan', () => {
		expect(
			sumWordDeltas([
				{ added: 10, removed: 2 },
				{ added: 5, removed: 0 },
			]),
		).toEqual({ added: 15, removed: 2 })
	})
})
