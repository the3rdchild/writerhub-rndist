import { describe, expect, test } from 'bun:test'
import type { DocMeta } from '@/features/sessions/ydoc'
import { filterByProject, mergeDocuments } from './merged'
import type { DocumentSummary } from './types'

const local = (id: string, title: string, updatedAt: number, tabs = 1): DocMeta => ({
	id,
	title,
	tabOrder: Array.from({ length: tabs }, (_, i) => `${id}-tab${i}`),
	updatedAt,
	titleUpdatedAt: 0,
	pageSetup: null,
})

const server = (
	id: string,
	title: string,
	updatedAt: number,
	projectId: string | null = null,
	tabCount = 1,
): DocumentSummary => ({ id, title, projectId, tabCount, updatedAt, createdAt: 0 })

describe('penggabungan dokumen lokal dan server', () => {
	test('dokumen tertaut muncul sekali, bukan dua', () => {
		const merged = mergeDocuments([local('L1', 'Bab 1', 10)], [server('S1', 'Bab 1', 5)], () => 'S1')
		expect(merged).toHaveLength(1)
		expect(merged[0]).toMatchObject({ localId: 'L1', serverId: 'S1', origin: 'synced' })
	})

	test('dokumen lokal tanpa kaitan ditandai lokal-saja', () => {
		const merged = mergeDocuments([local('L1', 'Draf', 10)], [], () => null)
		expect(merged[0]).toMatchObject({ serverId: null, origin: 'local-only' })
	})

	test('dokumen server yang tidak terbuka tetap ikut terdaftar', () => {
		const merged = mergeDocuments([], [server('S1', 'oke1', 7)], () => null)
		expect(merged[0]).toMatchObject({ localId: null, serverId: 'S1', origin: 'server-only' })
	})

	test('judul sisi lokal yang dipakai untuk dokumen tertaut', () => {
		// Sisi lokal adalah yang sedang dilihat pengguna; penyelarasan judul
		// terpisah yang memastikan server menyusul.
		const merged = mergeDocuments(
			[local('L1', 'dokumen 5', 10)],
			[server('S1', 'oke1', 5)],
			() => 'S1',
		)
		expect(merged[0].title).toBe('dokumen 5')
	})

	test('waktu diambil yang paling baru dari kedua sisi', () => {
		const merged = mergeDocuments([local('L1', 'X', 10)], [server('S1', 'X', 99)], () => 'S1')
		expect(merged[0].updatedAt).toBe(99)
	})

	test('jumlah tab dibaca dari lokal supaya tab yang belum tersimpan ikut terhitung', () => {
		const merged = mergeDocuments(
			[local('L1', 'X', 10, 3)],
			[server('S1', 'X', 5, null, 1)],
			() => 'S1',
		)
		expect(merged[0].tabCount).toBe(3)
	})

	test('diurutkan dari yang terakhir dikerjakan', () => {
		const merged = mergeDocuments(
			[local('L1', 'Lama', 1), local('L2', 'Baru', 9)],
			[server('S9', 'Server', 5)],
			() => null,
		)
		expect(merged.map((d) => d.title)).toEqual(['Baru', 'Server', 'Lama'])
	})
})

describe('penyaringan proyek', () => {
	const docs = mergeDocuments(
		[local('L1', 'Lokal saja', 10)],
		[server('S1', 'Di proyek', 9, 'P1'), server('S2', 'Tanpa proyek', 8, null)],
		() => null,
	)

	test('"semua" memuat semuanya', () => {
		expect(filterByProject(docs, 'all')).toHaveLength(3)
	})

	test('"tanpa proyek" memuat dokumen lokal-saja juga', () => {
		expect(filterByProject(docs, 'none').map((d) => d.title).sort()).toEqual([
			'Lokal saja',
			'Tanpa proyek',
		])
	})

	test('proyek tertentu tidak pernah memuat dokumen lokal-saja', () => {
		expect(filterByProject(docs, 'P1').map((d) => d.title)).toEqual(['Di proyek'])
	})
})
