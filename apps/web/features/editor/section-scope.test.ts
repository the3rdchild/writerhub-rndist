import { describe, expect, test } from 'bun:test'
import { Schema } from '@tiptap/pm/model'
import { EditorState, NodeSelection, TextSelection } from '@tiptap/pm/state'
import type { Editor } from '@tiptap/react'
import { sectionRange } from './section-scope'

const schema = new Schema({
	nodes: {
		doc: { content: 'block+' },
		paragraph: { group: 'block', content: 'text*' },
		text: {},
		/* Atom tingkat-teratas seperti pemenggal halaman "Halaman Baru". */
		pageBreak: { group: 'block', atom: true, selectable: true },
	},
})

const doc = schema.node('doc', null, [
	schema.node('paragraph', null, [schema.text('satu')]),
	schema.node('pageBreak'),
	schema.node('paragraph', null, [schema.text('dua')]),
])

/** `sectionRange` hanya menyentuh `isDestroyed` dan `state`. */
function editorAt(selection: (state: EditorState) => EditorState['selection']): Editor {
	const base = EditorState.create({ doc })
	const state = base.apply(base.tr.setSelection(selection(base)))
	return { isDestroyed: false, state } as unknown as Editor
}

describe('sectionRange from_here', () => {
	test('kursor di dalam paragraf memakai awal blok teratasnya', () => {
		const editor = editorAt((state) => TextSelection.create(state.doc, 2))
		expect(sectionRange(editor, 'from_here')).toEqual({ from: 0 })
	})

	test('node teratas yang terpilih utuh tidak melempar RangeError', () => {
		// Pemenggal halaman: depth 0, dan posisinya sudah posisi sebelum node.
		const editor = editorAt((state) => NodeSelection.create(state.doc, 6))
		expect(() => sectionRange(editor, 'from_here')).not.toThrow()
		expect(sectionRange(editor, 'from_here')).toEqual({ from: 6 })
	})

	test('kursor di paragraf sesudah pemenggal memakai awal paragraf itu', () => {
		const editor = editorAt((state) => TextSelection.create(state.doc, 9))
		expect(sectionRange(editor, 'from_here')).toEqual({ from: 7 })
	})
})
