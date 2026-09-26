import { describe, expect, test } from 'bun:test'
import type { JSONContent } from '@tiptap/core'
import { EditorState } from '@tiptap/pm/state'
import { buildTextIndex, textRangeToPM } from '@/features/document/tiptap-offsets'
import { buildSchema } from '@/features/sync/serialize'
import { setBlockStyle } from './paragraph-style'

const schema = buildSchema()
const text = (value: string): JSONContent => ({ type: 'text', text: value })
const BR: JSONContent = { type: 'hardBreak' }
const paragraph = (...content: JSONContent[]): JSONContent => ({ type: 'paragraph', content })
const heading = (level: number, ...content: JSONContent[]): JSONContent => ({
	type: 'heading',
	attrs: { level },
	content,
})

/** Menjalankan gaya seperti `apply_paragraph_style`: cari teksnya, lalu ubah bloknya. */
function apply(blocks: JSONContent[], find: string, style: 'heading' | 'paragraph', level = 2) {
	const state = EditorState.create({ doc: schema.nodeFromJSON({ type: 'doc', content: blocks }) })
	const index = buildTextIndex(state.doc)
	const range = textRangeToPM(index, index.text.indexOf(find), find.length)
	if (!range) throw new Error(`"${find}" tidak ditemukan`)
	const tr = state.tr
	setBlockStyle(tr, range, schema.nodes[style], style === 'heading' ? { level } : {})
	return tr.doc.content.content.map((node) => ({
		type: node.type.name,
		level: node.attrs.level as number | undefined,
		text: node.textBetween(0, node.content.size, '', '⏎'),
	}))
}

const PARA = 'Struktur pasar merupakan salah satu konsep fundamental.'
const NEXT = 'Konsep persaingan monopolistik pertama kali diperkenalkan.'

describe('gaya paragraf pada blok berpindah baris lunak', () => {
	/* Laporan pengguna 26 Sep: judul dan paragrafnya satu blok (Shift+Enter),
	 * dan "jadikan heading 2" menjadikan paragrafnya ikut heading. */
	test('hanya baris judul yang menjadi heading; isinya tetap paragraf', () => {
		const result = apply(
			[paragraph(text('1.1 Latar Belakang'), BR, text(PARA)), paragraph(text(NEXT))],
			'1.1 Latar Belakang',
			'heading',
		)
		expect(result).toEqual([
			{ type: 'heading', level: 2, text: '1.1 Latar Belakang' },
			{ type: 'paragraph', level: undefined, text: PARA },
			{ type: 'paragraph', level: undefined, text: NEXT },
		])
	})

	test('baris di tengah dipisah dari kedua tetangganya', () => {
		const result = apply(
			[paragraph(text('atas'), BR, text('tengah'), BR, text('bawah'))],
			'tengah',
			'heading',
			3,
		)
		expect(result.map((block) => `${block.type}:${block.text}`)).toEqual([
			'paragraph:atas',
			'heading:tengah',
			'paragraph:bawah',
		])
	})

	test('heading yang telanjur menelan paragrafnya bisa dipulihkan', () => {
		const result = apply(
			[heading(2, text('1.1 Latar Belakang'), BR, text(PARA))],
			'Struktur pasar',
			'paragraph',
		)
		expect(result.map((block) => `${block.type}:${block.text}`)).toEqual([
			'heading:1.1 Latar Belakang',
			`paragraph:${PARA}`,
		])
	})

	test('judul dua baris yang disengaja tetap utuh saat hanya levelnya berubah', () => {
		const result = apply([heading(2, text('BAB I'), BR, text('PENDAHULUAN'))], 'BAB I', 'heading', 1)
		expect(result).toEqual([{ type: 'heading', level: 1, text: 'BAB I⏎PENDAHULUAN' }])
	})

	test('rentang yang melintasi pindah baris membawa semua barisnya', () => {
		const result = apply([paragraph(text('a'), BR, text('b'), BR, text('c'))], 'b', 'heading')
		expect(result).toHaveLength(3)
		const spanning = apply([paragraph(text('satu'), BR, text('dua'), BR, text('tiga'))], 'dua', 'heading')
		expect(spanning[1]).toEqual({ type: 'heading', level: 2, text: 'dua' })
	})

	test('blok tanpa pindah baris berubah utuh seperti sebelumnya', () => {
		expect(
			apply([paragraph(text('1.1 Latar Belakang')), paragraph(text(PARA))], '1.1 Latar Belakang', 'heading'),
		).toEqual([
			{ type: 'heading', level: 2, text: '1.1 Latar Belakang' },
			{ type: 'paragraph', level: undefined, text: PARA },
		])
	})
})
