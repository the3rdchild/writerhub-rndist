import { describe, expect, test } from 'bun:test'
import type { JSONContent } from '@tiptap/core'
import { EditorState } from '@tiptap/pm/state'
import { buildSchema } from '@/features/sync/serialize'
import {
	clampColumnWidths,
	explicitColumnWidths,
	MIN_COLUMN_WIDTH,
	scaleColumnWidths,
	writeColumnWidths,
} from './table-ops'
function cell(widths: number[] | null, text = 'sel'): JSONContent {
	return {
		type: 'tableCell',
		...(widths ? { attrs: { colwidth: widths } } : {}),
		content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
	}
}

function tableDoc(...widths: (number[] | null)[]): JSONContent {
	return {
		type: 'table',
		content: [
			{ type: 'tableRow', content: widths.map((w) => cell(w)) },
			{ type: 'tableRow', content: widths.map((w) => cell(w)) },
		],
	}
}

function tableNode(...widths: (number[] | null)[]) {
	const doc = buildSchema().nodeFromJSON({ type: 'doc', content: [tableDoc(...widths)] })
	return doc.firstChild!
}

function stateOf(...content: JSONContent[]) {
	const schema = buildSchema()
	return EditorState.create({ schema, doc: schema.nodeFromJSON({ type: 'doc', content }) })
}

describe('explicitColumnWidths', () => {
	test('membaca colwidth apa adanya bila seluruh kolom terisi', () => {
		expect(explicitColumnWidths(tableNode([420], [180]))).toEqual([420, 180])
	})

	test('null bila ada satu kolom pun yang belum punya colwidth', () => {
		expect(explicitColumnWidths(tableNode([420], null))).toBeNull()
		expect(explicitColumnWidths(tableNode(null, null))).toBeNull()
	})
})

describe('scaleColumnWidths', () => {
	test('menyempitkan proporsional: rasio antar kolom bertahan', () => {
		expect(scaleColumnWidths([420, 180], 300)).toEqual([210, 90])
	})

	test('membesarkan pun proporsional', () => {
		expect(scaleColumnWidths([100, 200], 600)).toEqual([200, 400])
	})

	test('tidak ada kolom yang turun di bawah lantai minimum', () => {
		const scaled = scaleColumnWidths([570, 30], 100)
		expect(scaled.every((width) => width >= MIN_COLUMN_WIDTH)).toBe(true)
	})

	test('total nol atau negatif dibiarkan apa adanya', () => {
		expect(scaleColumnWidths([0, 0], 300)).toEqual([0, 0])
	})
})

describe('clampColumnWidths (E3)', () => {
	test('tabel yang muat di petaknya tidak dikoreksi', () => {
		expect(clampColumnWidths([150, 100], 300)).toBeNull()
	})

	test('tabel tanpa colwidth tidak dikoreksi', () => {
		expect(clampColumnWidths(null, 100)).toBeNull()
	})

	test('tabel yang meluber disempitkan ke lebar petak', () => {
		expect(clampColumnWidths([420, 180], 190)).toEqual([133, 57])
	})

	test('petak lebih sempit dari lantai minimum: menyempit sebisanya lalu berhenti', () => {
		const widths = [MIN_COLUMN_WIDTH * 2, MIN_COLUMN_WIDTH * 2]
		expect(clampColumnWidths(widths, MIN_COLUMN_WIDTH)).toEqual([MIN_COLUMN_WIDTH, MIN_COLUMN_WIDTH])
		expect(clampColumnWidths([MIN_COLUMN_WIDTH, MIN_COLUMN_WIDTH], MIN_COLUMN_WIDTH)).toBeNull()
	})
})

describe('writeColumnWidths', () => {
	test('menulis ke seluruh sel dalam satu transaksi, tanpa mengirimkannya', () => {
		const state = stateOf(tableDoc([420], [180]))
		const tr = state.tr

		expect(writeColumnWidths(tr, tr.doc, 0, [210, 90])).toBe(true)
		expect(explicitColumnWidths(tr.doc.firstChild!)).toEqual([210, 90])
	})

	test('posisi yang bukan tabel dibatalkan begitu saja', () => {
		const state = stateOf({ type: 'paragraph' })
		const tr = state.tr
		expect(writeColumnWidths(tr, tr.doc, 0, [100])).toBe(false)
	})

	test('lebar yang sudah sama tidak menulis apa pun', () => {
		const state = stateOf(tableDoc([100]))
		const tr = state.tr
		expect(writeColumnWidths(tr, tr.doc, 0, [100])).toBe(false)
		expect(tr.docChanged).toBe(false)
	})
})
