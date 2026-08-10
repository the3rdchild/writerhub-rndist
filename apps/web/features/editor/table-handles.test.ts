import { describe, expect, test } from 'bun:test'
import { getSchema } from '@tiptap/core'
import { EditorState } from '@tiptap/pm/state'
import { TableMap } from '@tiptap/pm/tables'
import type { Node as PMNode, Schema } from '@tiptap/pm/model'
import { buildEditorExtensions } from './extensions'
import { dropIndex, locateTableAt } from './table-ops'

/**
 * Dua hitungan yang menopang handle tabel, diuji tanpa DOM.
 *
 * `locateTableAt` menerjemahkan posisi dokumen jadi indeks baris/kolom - salah
 * satu offset saja dan handle akan menyunting baris tetangga. `dropIndex`
 * menerjemahkan batas garis sisip jadi indeks tujuan; pergeseran satu setelah
 * baris sumber dicabut mudah terlewat dan baru ketahuan saat baris mendarat
 * satu langkah dari tempat yang ditunjuk.
 */

const schema: Schema = getSchema(buildEditorExtensions({}))

/** Dokumen berisi satu tabel `rows × cols`; baris pertama jadi kepala. */
function tableDoc(rows: number, cols: number): PMNode {
	const content = Array.from({ length: rows }, (_, r) => ({
		type: 'tableRow',
		content: Array.from({ length: cols }, (_, c) => ({
			type: r === 0 ? 'tableHeader' : 'tableCell',
			content: [{ type: 'paragraph', content: [{ type: 'text', text: `r${r}c${c}` }] }],
		})),
	}))
	return schema.nodeFromJSON({
		type: 'doc',
		content: [{ type: 'paragraph' }, { type: 'table', content }],
	})
}

/** Posisi tabel + peta selnya, seperti yang dipakai lapisan handle. */
function tableInfo(doc: PMNode) {
	let tablePos = -1
	doc.descendants((node, pos) => {
		if (node.type.spec.tableRole === 'table' && tablePos === -1) tablePos = pos
		return tablePos === -1
	})
	const table = doc.nodeAt(tablePos)
	if (!table) throw new Error('tabel tidak ditemukan')
	return { tablePos, map: TableMap.get(table) }
}

describe('locateTableAt', () => {
	const doc = tableDoc(3, 4)
	const state = EditorState.create({ doc })
	const { tablePos, map } = tableInfo(doc)

	test('setiap sel terpetakan ke indeks baris & kolomnya sendiri', () => {
		for (let r = 0; r < map.height; r++) {
			for (let c = 0; c < map.width; c++) {
				// Posisi di dalam sel: awal isi selnya.
				const inCell = tablePos + 1 + map.map[r * map.width + c] + 1
				const loc = locateTableAt(state, inCell)
				expect(loc).not.toBeNull()
				expect({ row: loc?.rowIndex, col: loc?.colIndex }).toEqual({ row: r, col: c })
			}
		}
	})

	test('ukuran grid ikut terbawa', () => {
		const loc = locateTableAt(state, tablePos + 2)
		expect(loc?.tablePos).toBe(tablePos)
		expect(loc?.rowCount).toBe(3)
		expect(loc?.colCount).toBe(4)
	})

	test('posisi di luar tabel tidak menghasilkan lokasi', () => {
		expect(locateTableAt(state, 1)).toBeNull()
	})
})

describe('dropIndex', () => {
	test('menjatuhkan ke batas sebelum sumber tidak menggeser indeks', () => {
		// Kolom 3 dijatuhkan di batas 1 ("sebelum kolom 1") mendarat di indeks 1.
		expect(dropIndex(3, 1)).toBe(1)
		expect(dropIndex(3, 0)).toBe(0)
	})

	test('menjatuhkan ke batas setelah sumber mundur satu', () => {
		// Kolom 0 dijatuhkan di batas 3 ("sebelum kolom 3"): setelah kolom 0
		// dicabut, sisanya bergeser kiri, jadi tujuannya indeks 2.
		expect(dropIndex(0, 3)).toBe(2)
		// Batas terakhir (= jumlah kolom) berarti "paling kanan".
		expect(dropIndex(0, 4)).toBe(3)
	})

	test('batas di kedua sisi sumber berarti tidak pindah', () => {
		expect(dropIndex(2, 2)).toBe(2)
		expect(dropIndex(2, 3)).toBe(2)
	})
})
