import { describe, expect, test } from 'bun:test'
import type { JSONContent } from '@tiptap/core'
import { excerpt, jsonPlainText } from './text-content'

const doc = (...content: JSONContent[]): JSONContent => ({ type: 'doc', content })
const para = (...text: string[]): JSONContent => ({
	type: 'paragraph',
	content: text.map((value) => ({ type: 'text', text: value })),
})

describe('teks polos dari dokumen Tiptap', () => {
	test('dokumen kosong dan nilai kosong menghasilkan string kosong', () => {
		expect(jsonPlainText(null)).toBe('')
		expect(jsonPlainText(undefined)).toBe('')
		expect(jsonPlainText(doc())).toBe('')
	})

	test('paragraf terpisah baris baru, bukan menempel', () => {
		expect(jsonPlainText(doc(para('Bagian satu'), para('Bagian dua')))).toBe('Bagian satu\nBagian dua')
	})

	test('potongan teks dalam satu paragraf digabung tanpa pemisah', () => {
		// Teks bertanda tebal terpecah jadi beberapa node; menyisipkan spasi di
		// antaranya akan merusak kata.
		expect(jsonPlainText(doc(para('Peng', 'antar')))).toBe('Pengantar')
	})

	test('teks di dalam tabel dan daftar ikut terbaca', () => {
		const isi = doc({
			type: 'bulletList',
			content: [{ type: 'listItem', content: [para('Butir pertama')] }],
		})

		expect(jsonPlainText(isi)).toBe('Butir pertama')
	})

	test('penelusuran berhenti setelah melewati batas karakter', () => {
		const panjang = doc(...Array.from({ length: 500 }, (_, i) => para(`Paragraf ${i}`)))
		const hasil = jsonPlainText(panjang, 50)

		expect(hasil.length).toBeLessThan(120)
		expect(hasil.startsWith('Paragraf 0')).toBe(true)
	})
})

describe('cuplikan satu baris', () => {
	test('teks pendek dikembalikan apa adanya', () => {
		expect(excerpt('Ringkas saja', 100)).toBe('Ringkas saja')
	})

	test('baris baru dan spasi berlebih dirapatkan', () => {
		expect(excerpt('Satu\n\nDua   tiga', 100)).toBe('Satu Dua tiga')
	})

	test('pemotongan jatuh di batas kata, bukan di tengah kata', () => {
		const hasil = excerpt('Pemeriksaan tata bahasa otomatis untuk naskah panjang', 20)

		expect(hasil.endsWith('…')).toBe(true)
		expect(hasil).not.toContain('otomat…')
		expect(hasil.length).toBeLessThanOrEqual(21)
	})
})
