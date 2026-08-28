import { describe, expect, test } from 'bun:test'
import { furnitureLineFor, hasFurniture, normalizePageFurniture, type PageFurniture } from './model'

describe('resolusi varian perabot halaman', () => {
	const furniture: PageFurniture = {
		header: { default: { text: 'biasa', align: 'left' }, first: { text: 'awal', align: 'left' } },
		footer: { even: { text: 'genap', align: 'left' }, default: { text: 'kaki', align: 'left' } },
	}

	test('halaman pertama memakai varian first', () => {
		expect(furnitureLineFor(furniture, 'header', 0)?.text).toBe('awal')
	})

	test('halaman genap (indeks ganjil) memakai varian even', () => {
		expect(furnitureLineFor(furniture, 'footer', 1)?.text).toBe('genap')
		expect(furnitureLineFor(furniture, 'footer', 3)?.text).toBe('genap')
	})

	test('halaman lain jatuh ke default', () => {
		expect(furnitureLineFor(furniture, 'header', 1)?.text).toBe('biasa')
		expect(furnitureLineFor(furniture, 'footer', 2)?.text).toBe('kaki')
	})

	test('slot tanpa varian first tidak menghentikan default di halaman pertama', () => {
		// footer tidak punya first → halaman pertama pakai default
		expect(furnitureLineFor(furniture, 'footer', 0)?.text).toBe('kaki')
	})

	test('null saat perabot kosong', () => {
		expect(furnitureLineFor(null, 'header', 0)).toBeNull()
		expect(furnitureLineFor({ footer: {} }, 'header', 0)).toBeNull()
	})
})

describe('normalisasi bentuk bebas', () => {
	test('objek valid dipertahankan', () => {
		const raw = { footer: { default: { text: 'kaki', align: 'center' } } }
		expect(normalizePageFurniture(raw)).toEqual(raw)
	})

	test('varian dan align asing dibuang', () => {
		const normalized = normalizePageFurniture({
			footer: { aneh: { text: 'x', align: 'left' }, default: { text: 'ok', align: 'kanan' } },
		})
		expect(normalized).toBeNull()
	})

	test('teks kosong tidak dihitung sebagai baris', () => {
		expect(normalizePageFurniture({ header: { default: { text: '', align: 'left' } } })).toBeNull()
	})

	test('hasFurniture melihat kedua slot', () => {
		expect(hasFurniture({ header: { default: { text: 'a', align: 'left' } } })).toBe(true)
		expect(hasFurniture({})).toBe(false)
		expect(hasFurniture(null)).toBe(false)
	})
})
