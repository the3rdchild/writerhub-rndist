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
