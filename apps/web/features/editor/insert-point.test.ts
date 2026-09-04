import { describe, expect, test } from 'bun:test'
import { getSchema } from '@tiptap/core'
import { EditorState, NodeSelection, TextSelection } from '@tiptap/pm/state'
import StarterKit from '@tiptap/starter-kit'
import { HtmlBlock } from './html-block'
import { escapeNodeSelection } from './insert-point'

const schema = getSchema([StarterKit, HtmlBlock])

/**
 * Keadaan persis sesudah sampul disisipkan: blok rancangan sebagai anak pertama,
 * paragraf penutup dari `TrailingParagraph` di belakangnya, dan kursor berupa
 * `NodeSelection` di atas bloknya.
 */
function afterCoverInsert(): EditorState {
	const doc = schema.node('doc', null, [
		schema.node('htmlBlock', { html: '<h1>Si Kancil</h1>', fit: 'page' }),
		schema.node('paragraph', null, []),
	])
	const state = EditorState.create({ schema, doc })
	return state.apply(state.tr.setSelection(NodeSelection.create(doc, 0)))
}

describe('kursor sesudah blok atom', () => {
	test('pilihan simpul dipindahkan ke paragraf sesudahnya', () => {
		const { tr } = afterCoverInsert()

		expect(tr.selection instanceof NodeSelection).toBe(true)
		escapeNodeSelection(tr)

		expect(tr.selection instanceof NodeSelection).toBe(false)
		expect(tr.selection instanceof TextSelection).toBe(true)
		expect(tr.selection.empty).toBe(true)
		expect(tr.doc.resolve(tr.selection.from).parent.type.name).toBe('paragraph')
	})

	test('sisipan berikutnya tidak lagi menimpa bloknya', () => {
		// Inti bugnya: `replaceWith` sepanjang rentang pilihan. Dengan
		// NodeSelection rentang itu adalah bloknya sendiri.
		const polos = afterCoverInsert().tr
		polos.replaceWith(
			polos.selection.from,
			polos.selection.to,
			schema.node('paragraph', null, [schema.text('Bab 1')]),
		)
		expect(polos.doc.firstChild?.type.name).toBe('paragraph')

		const dijaga = escapeNodeSelection(afterCoverInsert().tr)
		dijaga.replaceWith(
			dijaga.selection.from,
			dijaga.selection.to,
			schema.node('paragraph', null, [schema.text('Bab 1')]),
		)
		expect(dijaga.doc.firstChild?.type.name).toBe('htmlBlock')
		expect(dijaga.doc.textContent).toContain('Bab 1')
	})

	test('kursor teks biasa dibiarkan apa adanya', () => {
		const doc = schema.node('doc', null, [schema.node('paragraph', null, [schema.text('halo')])])
		const state = EditorState.create({ schema, doc })
		const tr = state.tr.setSelection(TextSelection.create(doc, 3))

		escapeNodeSelection(tr)
		expect(tr.selection.from).toBe(3)
	})
})
