import { describe, expect, test } from 'bun:test'
import type { JSONContent } from '@tiptap/core'
import { EditorState, TextSelection } from '@tiptap/pm/state'
import { buildSchema } from '@/features/sync/serialize'
import { collapsedMargin } from './column-measure'
import { migrateLegacyColumns, selectionInColumns } from './columns'

describe('penggabungan margin (§P4 catatan pengukuran, A-2)', () => {
	test('DOM terluar yang punya margin sendiri memakai miliknya', () => {
		expect(collapsedMargin(16, 0, 0, 12)).toBe(16)
	})

	test('tableWrapper tanpa margin membaca margin <table> di dalamnya', () => {
		expect(collapsedMargin(0, 0, 0, 12)).toBe(12)
	})

	test('margin anak tidak dibaca bila ada padding - ia tidak menggabung keluar', () => {
		expect(collapsedMargin(0, 8, 0, 12)).toBe(0)
	})

	test('margin anak tidak dibaca bila ada border', () => {
		expect(collapsedMargin(0, 0, 1, 12)).toBe(0)
	})
})

describe('migrasi blok kolom lama saat dibuka (E5 langkah 4)', () => {
	const para = (text: string): JSONContent => ({ type: 'paragraph', content: [{ type: 'text', text }] })

	function stateOf(content: JSONContent[]): EditorState {
		const schema = buildSchema()
		return EditorState.create({ schema, doc: schema.nodeFromJSON({ type: 'doc', content }) })
	}

	test('blok columns diganti sepasang pembatas menerus dan isinya terangkat', () => {
		const state = stateOf([
			para('sebelum'),
			{ type: 'columns', attrs: { count: 3 }, content: [para('a'), para('b')] },
			para('sesudah'),
		])

		const tr = migrateLegacyColumns(state)
		expect(tr).not.toBeNull()
		expect(tr!.getMeta('addToHistory')).toBe(false)

		const next = state.apply(tr!).doc
		expect(next.childCount).toBe(6)
		expect(next.child(0).textContent).toBe('sebelum')
		expect(next.child(1).type.name).toBe('sectionBreak')
		expect(next.child(1).attrs).toMatchObject({ continuous: true, columns: { count: 3 } })
		expect(next.child(2).textContent).toBe('a')
		expect(next.child(3).textContent).toBe('b')
		expect(next.child(4).type.name).toBe('sectionBreak')
		expect(next.child(4).attrs).toMatchObject({ continuous: true, columns: null })
		expect(next.child(5).textContent).toBe('sesudah')
	})

	test('celah kolom ikut ke pembatas pembukanya', () => {
		const state = stateOf([{ type: 'columns', attrs: { count: 2, gap: 40 }, content: [para('a')] }])
		const next = state.apply(migrateLegacyColumns(state)!).doc
		expect(next.child(0).attrs.columns).toEqual({ count: 2, gap: 40 })
	})

	test('idempoten: migrasi kedua atas hasilnya bukan transaksi', () => {
		const state = stateOf([{ type: 'columns', attrs: { count: 2 }, content: [para('a')] }])
		const migrated = EditorState.create({
			schema: buildSchema(),
			doc: state.apply(migrateLegacyColumns(state)!).doc,
		})
		expect(migrateLegacyColumns(migrated)).toBeNull()
	})

	test('naskah yang sudah bersih tidak disentuh sama sekali', () => {
		expect(migrateLegacyColumns(stateOf([para('biasa')]))).toBeNull()
	})
})

describe('tombol "Two columns" di toolbar mengenali wilayah berkolom (KOL-10)', () => {
	const schema = buildSchema()
	const para = (text: string): JSONContent => ({ type: 'paragraph', content: [{ type: 'text', text }] })
	const doc = schema.nodeFromJSON({
		type: 'doc',
		content: [
			para('sebelum'),
			{ type: 'sectionBreak', attrs: { pageSetup: null, columns: { count: 2 }, continuous: true } },
			para('di dalam'),
			{ type: 'sectionBreak', attrs: { pageSetup: null, columns: null, continuous: true } },
			para('sesudah'),
		],
	})
	const at = (pos: number) => {
		const state = EditorState.create({ schema, doc })
		return state.apply(state.tr.setSelection(TextSelection.create(state.doc, pos)))
	}
	const inside = 'sebelum'.length + 2 + 1 + 3

	test('kursor di wilayah section berkolom: aktif', () => {
		expect(selectionInColumns(at(inside))).toBe(true)
	})

	test('kursor di luar wilayah: tidak aktif', () => {
		expect(selectionInColumns(at(2))).toBe(false)
		expect(selectionInColumns(at(doc.content.size - 2))).toBe(false)
	})
})
