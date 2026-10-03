import { describe, expect, test } from 'bun:test'
import type { JSONContent } from '@tiptap/core'
import { EditorState, TextSelection } from '@tiptap/pm/state'
import { buildSchema } from '@/features/sync/serialize'
import { snapFrom } from './ruler-drag'
import {
	addTabStop,
	cycleTabStop,
	moveTabStop,
	removeTabStop,
	selectedParagraphs,
	tabStopsAt,
	updateTabStops,
} from './ruler-tabs'
import { insertsTabCharacter, type TabStop } from './tab-stops'

describe('kisi jepret tab stop mengikuti tepi area teks', () => {
	// Kolom 2 di A4 bermargin 1 in: tepinya 96 + 313 = 409 px, bukan kelipatan 1/16 in.
	test('klik 1 in dari tepi kolom 2 tetap 1 in (72 pt), bukan 95 px', () => {
		expect(snapFrom(409, 505, false) - 409).toBe(96)
		// Kisi kertas (titik nol 0) akan memberi 504 → 95 px dari tepi kolom.
		expect(snapFrom(0, 505, false)).toBe(504)
	})

	test('mode halus (Shift) menjepret per piksel dari tepi yang sama', () => {
		expect(snapFrom(409, 505.4, true) - 409).toBe(96)
	})
})

describe('tab stop dari penggaris (TKS-18)', () => {
	const stops: TabStop[] = [
		{ posPt: 72, type: 'left' },
		{ posPt: 216, type: 'right' },
	]

	test('klik menambah tab stop kiri, urut menurut posisi', () => {
		expect(addTabStop(stops, 144)).toEqual([
			{ posPt: 72, type: 'left' },
			{ posPt: 144, type: 'left' },
			{ posPt: 216, type: 'right' },
		])
	})

	test('menambah tepat di tab stop yang ada menggantikannya, tidak menggandakan', () => {
		expect(addTabStop(stops, 73)).toEqual([
			{ posPt: 73, type: 'left' },
			{ posPt: 216, type: 'right' },
		])
	})

	test('posisi tidak pernah negatif', () => {
		expect(addTabStop([], -10)).toEqual([{ posPt: 0, type: 'left' }])
	})

	test('menyeret memindahkan, jenisnya tetap', () => {
		expect(moveTabStop(stops, 216, 300)).toEqual([
			{ posPt: 72, type: 'left' },
			{ posPt: 300, type: 'right' },
		])
	})

	test('menyeret keluar penggaris membuangnya', () => {
		expect(removeTabStop(stops, 72)).toEqual([{ posPt: 216, type: 'right' }])
	})

	test('klik ganda menggilir jenis: kiri → tengah → kanan → kiri', () => {
		let next = cycleTabStop(stops, 72)
		expect(next[0].type).toBe('center')
		next = cycleTabStop(next, 72)
		expect(next[0].type).toBe('right')
		next = cycleTabStop(next, 72)
		expect(next[0].type).toBe('left')
	})
})

describe('tab stop diterapkan ke paragraf yang diseleksi', () => {
	const schema = buildSchema()
	const para = (text: string, tabStops: TabStop[] | null = null): JSONContent => ({
		type: 'paragraph',
		attrs: { tabStops },
		content: [{ type: 'text', text }],
	})
	function stateOf(content: JSONContent[], from: number, to = from): EditorState {
		const state = EditorState.create({ schema, doc: schema.nodeFromJSON({ type: 'doc', content }) })
		return state.apply(state.tr.setSelection(TextSelection.create(state.doc, from, to)))
	}

	test('penggaris menampilkan tab stop paragraf pertama seleksi', () => {
		const state = stateOf([para('satu', [{ posPt: 90, type: 'left' }]), para('dua')], 2)
		expect(tabStopsAt(state)).toEqual([{ posPt: 90, type: 'left' }])
	})

	test('menambah lewat seleksi dua paragraf mengenai keduanya, tab stop lain tidak tertimpa', () => {
		const state = stateOf(
			[para('satu', [{ posPt: 90, type: 'left' }]), para('dua', [{ posPt: 300, type: 'right' }])],
			2,
			9,
		)
		expect(selectedParagraphs(state)).toHaveLength(2)
		let next = state
		updateTabStops(
			state,
			(tr) => {
				next = state.apply(tr)
			},
			(current) => addTabStop(current, 180),
		)
		expect(next.doc.child(0).attrs.tabStops).toEqual([
			{ posPt: 90, type: 'left' },
			{ posPt: 180, type: 'left' },
		])
		expect(next.doc.child(1).attrs.tabStops).toEqual([
			{ posPt: 180, type: 'left' },
			{ posPt: 300, type: 'right' },
		])
	})

	test('tab stop terakhir dibuang: atribut kembali null (kelipatan baku 1,27 cm)', () => {
		const state = stateOf([para('satu', [{ posPt: 90, type: 'left' }])], 2)
		let next = state
		updateTabStops(
			state,
			(tr) => {
				next = state.apply(tr)
			},
			(current) => removeTabStop(current, 90),
		)
		expect(next.doc.child(0).attrs.tabStops).toBeNull()
	})
})

describe('Tab meloncat ke tab stop (TKS-18)', () => {
	const schema = buildSchema()
	function stateAt(paragraph: JSONContent, offset: number): EditorState {
		const state = EditorState.create({
			schema,
			doc: schema.nodeFromJSON({ type: 'doc', content: [paragraph] }),
		})
		return state.apply(state.tr.setSelection(TextSelection.create(state.doc, 1 + offset)))
	}
	const plain: JSONContent = { type: 'paragraph', content: [{ type: 'text', text: 'Nama' }] }
	const withStops: JSONContent = { ...plain, attrs: { tabStops: [{ posPt: 120, type: 'left' }] } }

	test('di tengah baris Tab selalu menyisipkan karakter tab', () => {
		expect(insertsTabCharacter(stateAt(plain, 4).selection)).toBe(true)
		expect(insertsTabCharacter(stateAt(withStops, 4).selection)).toBe(true)
	})

	test('di awal paragraf tanpa tab stop Tab tetap mengindentasi', () => {
		expect(insertsTabCharacter(stateAt(plain, 0).selection)).toBe(false)
	})

	test('di awal paragraf bertab stop Tab meloncat ke tab stop pertama', () => {
		expect(insertsTabCharacter(stateAt(withStops, 0).selection)).toBe(true)
	})

	test('di sel tabel Tab tetap milik tabel', () => {
		const table: JSONContent = {
			type: 'table',
			content: [{ type: 'tableRow', content: [{ type: 'tableCell', content: [withStops] }] }],
		}
		const state = EditorState.create({ schema, doc: schema.nodeFromJSON({ type: 'doc', content: [table] }) })
		const inCell = state.apply(state.tr.setSelection(TextSelection.create(state.doc, 5)))
		expect(inCell.selection.$from.parent.type.name).toBe('paragraph')
		expect(insertsTabCharacter(inCell.selection)).toBe(false)
	})
})
