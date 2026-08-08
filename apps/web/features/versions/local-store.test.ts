import { describe, expect, test } from 'bun:test'
import type { JSONContent } from '@tiptap/core'
import {
	LOCAL_INTERVAL_SNAPSHOT_MS,
	shouldSnapshotInterval,
} from './local-snapshot'
import { countWords, selectIntervalIdsToPrune } from './local-store'

/**
 * Bagian store versi lokal yang bisa diuji tanpa IndexedDB (fake-indexeddb
 * sengaja tidak ditambahkan sebagai dependency): penghitung kata, pemilihan
 * versi untuk prune, dan aturan penjaga 10 menit snapshot interval.
 */

describe('countWords', () => {
	test('teks sederhana dihitung per kata', () => {
		const json: JSONContent = {
			type: 'doc',
			content: [
				{ type: 'paragraph', content: [{ type: 'text', text: 'Halo dunia yang indah' }] },
			],
		}
		expect(countWords(json)).toBe(4)
	})

	test('rekursi ke node bersarang (blockquote, tabel)', () => {
		const json: JSONContent = {
			type: 'doc',
			content: [
				{
					type: 'blockquote',
					content: [
						{ type: 'paragraph', content: [{ type: 'text', text: 'satu dua' }] },
					],
				},
				{
					type: 'table',
					content: [
						{
							type: 'tableRow',
							content: [
								{
									type: 'tableCell',
									content: [
										{
											type: 'paragraph',
											content: [{ type: 'text', text: 'tiga' }],
										},
									],
								},
							],
						},
					],
				},
			],
		}
		expect(countWords(json)).toBe(3)
	})

	test('spasi berlebih dan teks kosong tidak menambah hitungan', () => {
		const json: JSONContent = {
			type: 'doc',
			content: [
				{ type: 'paragraph', content: [{ type: 'text', text: '  kata   sekali  ' }] },
				{ type: 'paragraph', content: [{ type: 'text', text: '   ' }] },
				{ type: 'paragraph' },
			],
		}
		expect(countWords(json)).toBe(2)
	})

	test('dokumen tanpa isi menghasilkan nol', () => {
		expect(countWords({ type: 'doc', content: [{ type: 'paragraph' }] })).toBe(0)
	})
})

describe('selectIntervalIdsToPrune', () => {
	const entry = (id: string, trigger: 'interval' | 'manual' | 'pre_restore', createdAt: number) => ({
		id,
		trigger,
		createdAt,
	})

	test('hanya versi interval di luar keep terbaru yang dipangkas', () => {
		const versions = [
			entry('i1', 'interval', 100),
			entry('i2', 'interval', 200),
			entry('i3', 'interval', 300),
			entry('m1', 'manual', 150),
			entry('p1', 'pre_restore', 250),
		]
		expect(selectIntervalIdsToPrune(versions, 2)).toEqual(['i1'])
	})

	test('versi manual dan pre_restore tidak pernah ikut terpangkas', () => {
		const versions = [
			entry('m1', 'manual', 1),
			entry('p1', 'pre_restore', 2),
			entry('i1', 'interval', 3),
		]
		expect(selectIntervalIdsToPrune(versions, 1)).toEqual([])
	})

	test('tidak ada yang dipangkas bila interval tidak melebihi keep', () => {
		const versions = [entry('i1', 'interval', 100), entry('i2', 'interval', 200)]
		expect(selectIntervalIdsToPrune(versions, 50)).toEqual([])
		expect(selectIntervalIdsToPrune(versions, 2)).toEqual([])
	})

	test('urutan masukan acak tetap dipangkas dari yang tertua', () => {
		const versions = [
			entry('i3', 'interval', 300),
			entry('i1', 'interval', 100),
			entry('i2', 'interval', 200),
		]
		// i3 (terbaru) dipertahankan; yang dipangkas i2 dan i1.
		expect(selectIntervalIdsToPrune(versions, 1).sort()).toEqual(['i1', 'i2'])
	})
})

describe('shouldSnapshotInterval', () => {
	const now = 1_000_000_000

	test('di dalam jendela 10 menit tidak memotret', () => {
		expect(shouldSnapshotInterval(now - LOCAL_INTERVAL_SNAPSHOT_MS, 'a', 'b', now)).toBe(false)
	})

	test('di luar jendela tapi konten sama tidak memotret', () => {
		expect(
			shouldSnapshotInterval(now - LOCAL_INTERVAL_SNAPSHOT_MS - 1, 'sama', 'sama', now),
		).toBe(false)
	})

	test('di luar jendela dan konten berubah memotret', () => {
		expect(
			shouldSnapshotInterval(now - LOCAL_INTERVAL_SNAPSHOT_MS - 1, 'lama', 'baru', now),
		).toBe(true)
	})
})
