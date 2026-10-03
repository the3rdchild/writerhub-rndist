import { describe, expect, test } from 'bun:test'
import type { JSONContent } from '@tiptap/core'
import { EditorState, TextSelection } from '@tiptap/pm/state'
import { buildSchema } from '@/features/sync/serialize'
import { insertBreak } from './break-insert'

const schema = buildSchema()
const para = (text: string): JSONContent => ({
	type: 'paragraph',
	content: text ? [{ type: 'text', text }] : [],
})

function stateOf(content: JSONContent[], pos: number): EditorState {
	const state = EditorState.create({ schema, doc: schema.nodeFromJSON({ type: 'doc', content }) })
	return state.apply(state.tr.setSelection(TextSelection.create(state.doc, pos)))
}

function insert(state: EditorState, type = 'pageBreak'): EditorState {
	let next = state
	const ok = insertBreak(
		state,
		state.tr,
		(tr) => {
			next = state.apply(tr)
		},
		schema.nodes[type],
	)
	expect(ok).toBe(true)
	return next
}

function outline(state: EditorState): string[] {
	const out: string[] = []
	state.doc.forEach((node) => {
		out.push(node.isTextblock ? `"${node.textContent}"` : node.type.name)
	})
	return out
}

/** Ketik teks di kursor - meniru ketukan berikutnya sesudah menyisipkan pemenggal. */
function type(state: EditorState, text: string): EditorState {
	return state.apply(state.tr.insertText(text))
}

describe('menyisipkan pemenggal menaruh kursor di halaman/kolom baru (KOL-5)', () => {
	test('di ujung paragraf (bukan yang terakhir): pemenggal tetap ada sesudah diketik', () => {
		const state = stateOf([para('satu'), para('dua')], 1 + 'satu'.length)
		const next = type(insert(state), 'Lanjut')
		expect(outline(next)).toEqual(['"satu"', 'pageBreak', '"Lanjut"', '"dua"'])
	})

	test('kolom baru di ujung paragraf: sama, pemenggal kolom tidak tergantikan', () => {
		const state = stateOf([para('satu'), para('dua')], 1 + 'satu'.length)
		const next = type(insert(state, 'columnBreak'), 'X')
		expect(outline(next)).toEqual(['"satu"', 'columnBreak', '"X"', '"dua"'])
	})

	test('di tengah paragraf: dipecah, kursor di awal paruh kedua', () => {
		const state = stateOf([para('satudua')], 1 + 'satu'.length)
		const next = type(insert(state), '>')
		expect(outline(next)).toEqual(['"satu"', 'pageBreak', '">dua"'])
	})

	test('di ujung naskah: paragraf baru menampung kursor', () => {
		const state = stateOf([para('satu')], 1 + 'satu'.length)
		const next = insert(state)
		expect(outline(next)).toEqual(['"satu"', 'pageBreak', '""'])
		expect(next.selection.$from.parent.type.name).toBe('paragraph')
	})

	test('di paragraf kosong: paragraf itu yang pindah, tanpa baris kosong tambahan', () => {
		const state = stateOf([para('satu'), para(''), para('dua')], 1 + 'satu'.length + 2)
		const next = type(insert(state), 'Z')
		expect(outline(next)).toEqual(['"satu"', 'pageBreak', '"Z"', '"dua"'])
	})

	test('di tengah butir daftar: daftar dipecah, pemenggal di tingkat atas', () => {
		const list: JSONContent = {
			type: 'bulletList',
			content: [
				{ type: 'listItem', content: [para('alfa')] },
				{ type: 'listItem', content: [para('betagama')] },
			],
		}
		const state = stateOf([list], 3 + 'alfa'.length + 4 + 'beta'.length)
		const next = insert(state)
		expect(outline(next)).toEqual(['bulletList', 'pageBreak', 'bulletList'])
		expect(next.doc.child(2).textContent).toBe('gama')
		expect(next.selection.$from.parent.textContent).toBe('gama')
	})
})
