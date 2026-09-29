import { describe, expect, test } from 'bun:test'
import { getSchema } from '@tiptap/core'
import type { Node as PMNode } from '@tiptap/pm/model'
import { EditorState, NodeSelection, TextSelection } from '@tiptap/pm/state'
import StarterKit from '@tiptap/starter-kit'
import { buildSchema } from '@/features/sync/serialize'
import { HtmlBlock } from './html-block'
import { escapeNodeSelection, positionAfterTable } from './insert-point'

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

describe('kursor di dalam tabel (EX-1)', () => {
	const full = buildSchema()
	const paragraph = (text: string) => full.node('paragraph', null, [full.text(text)])
	const cell = (content: PMNode) => full.node('tableCell', null, [content])
	const table = (...cells: PMNode[]) => full.node('table', null, [full.node('tableRow', null, cells)])

	/** Kursor di akhir paragraf yang teksnya persis itu. */
	function cursorAtEndOf(doc: PMNode, text: string): TextSelection {
		let at = -1
		doc.descendants((node, pos) => {
			if (at < 0 && node.type.name === 'paragraph' && node.textContent === text)
				at = pos + 1 + node.content.size
		})
		return TextSelection.create(doc, at)
	}

	test('kursor tertinggal di sel terakhir: diagram mendarat sesudah tabelnya', () => {
		// Keadaan sesudah insert_content menulis "Tabel 1.1" beserta tabelnya.
		const doc = full.node('doc', null, [
			paragraph('Tabel 1.1'),
			table(cell(paragraph('a')), cell(paragraph('b'))),
		])
		const at = positionAfterTable(cursorAtEndOf(doc, 'b'))
		expect(at).toBe(doc.content.size)

		const tr = EditorState.create({ schema: full, doc }).tr
		tr.insert(at ?? 0, full.node('codeBlock', { language: 'diagram' }, [full.text('<svg/>')]))
		expect(tr.doc.childCount).toBe(3)
		expect(tr.doc.child(1).type.name).toBe('table')
		expect(tr.doc.child(1).textContent).toBe('ab')
		expect(tr.doc.lastChild?.type.name).toBe('codeBlock')
	})

	test('tabel bersarang: keluar dari tabel terluar, bukan hanya dari yang dalam', () => {
		const inner = table(cell(paragraph('dalam')))
		const doc = full.node('doc', null, [table(cell(paragraph('luar')), cell(inner)), paragraph('sesudah')])

		expect(positionAfterTable(cursorAtEndOf(doc, 'dalam'))).toBe(doc.firstChild?.nodeSize)
	})

	test('kursor di luar tabel: tidak ada yang dipindahkan', () => {
		const doc = full.node('doc', null, [table(cell(paragraph('sel'))), paragraph('naskah')])

		expect(positionAfterTable(cursorAtEndOf(doc, 'naskah'))).toBeNull()
	})
})
