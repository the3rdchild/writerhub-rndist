import { describe, expect, test } from 'bun:test'
import { rankSlashItems } from './slash-rank'

const ITEMS = [
	{ label: 'Daftar isi', keywords: ['toc', 'daftar isi'] },
	{ label: 'Daftar tabel', keywords: ['daftar tabel', 'lot', 'tabel', 'tables'] },
	{ label: 'Tabel', keywords: ['table', 'tabel', 'grid'] },
	{ label: 'Judul 1', keywords: ['h1', 'heading'] },
]

const labels = (query: string) => rankSlashItems(ITEMS, query).map((item) => item.label)

describe('peringkat menu slash (TBL-13)', () => {
	test('label yang cocok persis berada di depan walau tertulis belakangan', () => {
		expect(labels('tabel')[0]).toBe('Tabel')
		expect(labels('Tabel')[0]).toBe('Tabel')
	})

	test('kata kunci persis mengalahkan kecocokan di tengah kata', () => {
		expect(labels('table')[0]).toBe('Tabel')
	})

	test('awal kata di label mendahului kata kunci', () => {
		expect(labels('isi')).toEqual(['Daftar isi'])
		expect(labels('daftar')).toEqual(['Daftar isi', 'Daftar tabel'])
	})

	test('yang tidak cocok dibuang; kueri kosong mengembalikan semuanya berurutan', () => {
		expect(labels('zzz')).toEqual([])
		expect(labels('')).toEqual(ITEMS.map((item) => item.label))
	})
})

describe('kata kunci Indonesia setelah label berbahasa Inggris', () => {
	/* Label kini Inggris, jadi `/tabel` dan `/gambar` hanya cocok lewat kata
	 * kunci; daftar tabel/gambar tidak boleh ikut memakai kata itu sendirian,
	 * kalau tidak mereka seri dan menang karena tertulis lebih dulu (TBL-13). */
	const items = [
		{ label: 'List of figures', keywords: ['daftar gambar', 'lof', 'figures'] },
		{ label: 'List of tables', keywords: ['daftar tabel', 'lot', 'tables'] },
		{ label: 'Table', keywords: ['table', 'tabel', 'grid'] },
		{ label: 'Image', keywords: ['image', 'gambar', 'upload', 'media'] },
	]

	test('/tabel dan /gambar memilih Table dan Image', () => {
		expect(rankSlashItems(items, 'tabel')[0]?.label).toBe('Table')
		expect(rankSlashItems(items, 'gambar')[0]?.label).toBe('Image')
	})

	test('/daftar tabel tetap menemukan List of tables', () => {
		expect(rankSlashItems(items, 'daftar tabel')[0]?.label).toBe('List of tables')
	})
})

