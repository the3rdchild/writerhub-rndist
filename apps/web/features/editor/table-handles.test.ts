import { describe, expect, test } from 'bun:test'
import { getSchema } from '@tiptap/core'
import { EditorState } from '@tiptap/pm/state'
import type { Schema } from '@tiptap/pm/model'
import { buildEditorExtensions } from './extensions'
import { createTableHandlesPlugin, tableHandlesKey } from './table-handles'

/**
 * Handle tabel HARUS mendarat di dalam sel.
 *
 * Widget dekorasi yang jatuh tepat di posisi node sel dirender sebagai anak
 * langsung `<tr>`; peramban lalu membungkusnya jadi anonymous table-cell,
 * sehingga seluruh kolom bergeser dan tabel terlihat berantakan. Bugnya tak
 * terlihat di skema atau di tipe - hanya di layar - jadi posisinya diuji di
 * sini: setiap dekorasi harus punya induk berupa sel, bukan baris.
 */

const schema: Schema = getSchema(buildEditorExtensions({}))

/** Dokumen berisi satu tabel `rows × cols` dengan baris pertama sebagai kepala. */
function docWithTable(rows: number, cols: number) {
	const cell = (type: string) => ({ type, content: [{ type: 'paragraph' }] })
	const content = Array.from({ length: rows }, (_, r) => ({
		type: 'tableRow',
		content: Array.from({ length: cols }, () => cell(r === 0 ? 'tableHeader' : 'tableCell')),
	}))
	return schema.nodeFromJSON({
		type: 'doc',
		content: [{ type: 'paragraph' }, { type: 'table', content }],
	})
}

function decorationsFor(rows: number, cols: number) {
	const doc = docWithTable(rows, cols)
	const plugin = createTableHandlesPlugin({ onMenu: () => {}, onInsert: () => {}, onMove: () => {} })
	const state = EditorState.create({ doc, plugins: [plugin] })
	const set = tableHandlesKey.getState(state)
	return { doc, decorations: set?.find() ?? [] }
}

describe('dekorasi handle tabel', () => {
	test('setiap handle bersarang di dalam sel, bukan di antara sel', () => {
		const { doc, decorations } = decorationsFor(3, 4)

		expect(decorations.length).toBeGreaterThan(0)
		for (const deco of decorations) {
			const parent = doc.resolve(deco.from).parent
			expect(['cell', 'header_cell']).toContain(parent.type.spec.tableRole)
		}
	})

	test('ada satu handle per baris dan satu per kolom', () => {
		const { decorations } = decorationsFor(3, 4)
		expect(decorations.length).toBe(3 + 4)
	})

	test('tabel di dokumen tanpa tabel tidak menghasilkan dekorasi', () => {
		const doc = schema.nodeFromJSON({ type: 'doc', content: [{ type: 'paragraph' }] })
		const plugin = createTableHandlesPlugin({ onMenu: () => {}, onInsert: () => {}, onMove: () => {} })
		const state = EditorState.create({ doc, plugins: [plugin] })
		expect(tableHandlesKey.getState(state)?.find() ?? []).toHaveLength(0)
	})
})
