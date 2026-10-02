import { describe, expect, test } from 'bun:test'
import type { JSONContent } from '@tiptap/core'
import { buildSchema } from '@/features/sync/serialize'
import { cellTwips, tableGrid } from './export-docx-tables'

const cell = (attrs: Record<string, unknown> = {}): JSONContent => ({
	type: 'tableCell',
	attrs,
	content: [{ type: 'paragraph' }],
})
const tableOf = (rows: JSONContent[][], attrs: Record<string, unknown> = {}) =>
	buildSchema().nodeFromJSON({
		type: 'table',
		attrs,
		content: rows.map((cells) => ({ type: 'tableRow', content: cells })),
	})
const sum = (values: number[]) => values.reduce((total, value) => total + value, 0)

describe('kisi kolom tabel DOCX (TBL-6, TBL-7)', () => {
	test('kolom tanpa lebar berbagi sisa, kolom berlebar tetap ([195,65,130,∅] di 602 px)', () => {
		const grid = tableGrid(
			tableOf([[cell({ colwidth: [195] }), cell({ colwidth: [65] }), cell({ colwidth: [130] }), cell()]]),
			602,
		)
		expect(grid.columns).toEqual([195 * 15, 65 * 15, 130 * 15, 212 * 15])
	})

	test('lebar dari baris mana pun, bukan hanya baris pertama', () => {
		const grid = tableGrid(
			tableOf([
				[cell({ colspan: 2, colwidth: [100, 200] })],
				[cell({ colwidth: [100] }), cell({ colwidth: [200] })],
			]),
			602,
		)
		expect(grid.columns).toEqual([1500, 3000])
		expect(grid.rows[0][0]).toEqual({ left: 0, span: 2 })
		expect(cellTwips(grid, grid.rows[0][0])).toBe(4500)
	})

	test('tabel tanpa lebar sama sekali mengisi area teks, dibagi rata', () => {
		const grid = tableGrid(tableOf([[cell(), cell()]]), 602)
		expect(grid.columns).toEqual([4515, 4515])
	})

	test('"Lebar tabel" dipatuhi: kolom diskalakan, jumlahnya = lebar tabel', () => {
		const grid = tableGrid(tableOf([[cell(), cell(), cell()]], { tableWidth: 400 }), 602)
		expect(sum(grid.columns)).toBe(400 * 15)
	})

	test('jumlah yang melebihi area teks diperkecil proporsional', () => {
		const grid = tableGrid(
			tableOf([[cell({ colwidth: [300] }), cell({ colwidth: [200] }), cell({ colwidth: [200] })]]),
			542,
		)
		expect(sum(grid.columns)).toBe(542 * 15)
		expect(grid.columns[0] / grid.columns[1]).toBeCloseTo(1.5, 2)
	})

	test('sisa yang tidak cukup: semua kolom ikut diperkecil, tidak ada kolom nol', () => {
		const grid = tableGrid(tableOf([[cell({ colwidth: [400] }), cell({ colwidth: [300] }), cell()]]), 602)
		expect(sum(grid.columns)).toBe(602 * 15)
		expect(Math.min(...grid.columns)).toBeGreaterThan(0)
	})

	test('sel sesudah rowspan menempati kolom yang benar', () => {
		const grid = tableGrid(
			tableOf([
				[cell({ rowspan: 2, colwidth: [100] }), cell({ colwidth: [300] })],
				[cell({ colwidth: [300] })],
			]),
			602,
		)
		expect(grid.rows[1][0]).toEqual({ left: 1, span: 1 })
		expect(cellTwips(grid, grid.rows[1][0])).toBe(300 * 15)
	})

	test('tabel yang muat dipakai apa adanya, lebih sempit dari area teks', () => {
		const grid = tableGrid(tableOf([[cell({ colwidth: [120] }), cell({ colwidth: [80] })]]), 602)
		expect(grid.columns).toEqual([1800, 1200])
	})
})
