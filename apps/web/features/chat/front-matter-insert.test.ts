import { describe, expect, test } from 'bun:test'
import type { JSONContent } from '@tiptap/core'
import { EditorState } from '@tiptap/pm/state'
import { buildSchema } from '@/features/sync/serialize'
import { insertFrontMatter } from './front-matter-insert'

const schema = buildSchema()
const heading = (level: number, text: string): JSONContent => ({
	type: 'heading',
	attrs: { level },
	content: [{ type: 'text', text }],
})
const paragraph = (text: string): JSONContent => ({ type: 'paragraph', content: [{ type: 'text', text }] })

function run(blocks: JSONContent[], request: 'cover' | 'approval' | 'both' = 'both') {
	const state = EditorState.create({ doc: schema.nodeFromJSON({ type: 'doc', content: blocks }) })
	const tr = state.tr
	const outcome = insertFrontMatter(tr, schema, request, 'skripsi', { nama: 'Budi' })
	const outline: string[] = []
	tr.doc.forEach((node) => {
		if (node.type.name === 'pageBreak') outline.push('⤓')
		else if (node.textContent.trim()) outline.push(node.textContent.trim())
	})
	return { outcome, outline, tr }
}

describe('sampul dan pengesahan lewat alat', () => {
	test('keduanya di awal dokumen, tanpa pemenggal kedua sebelum BAB I', () => {
		const { outline, outcome } = run([heading(1, 'BAB I PENDAHULUAN'), paragraph('Isi.')])
		expect(outline[0]).toBe('SKRIPSI')
		const approval = outline.indexOf('HALAMAN PENGESAHAN')
		expect(outline[approval - 1]).toBe('⤓')
		expect(outline.filter((line) => line === '⤓')).toHaveLength(1)
		expect(outline.slice(-2)).toEqual(['BAB I PENDAHULUAN', 'Isi.'])
		expect(outcome.message).toContain('Never invent names')
	})

	test('sebelum paragraf biasa, pengesahan ditutup pemenggal sendiri', () => {
		const { outline } = run([paragraph('Kata pengantar dulu.')])
		expect(outline.filter((line) => line === '⤓')).toHaveLength(2)
	})

	test('tidak menggandakan yang sudah ada; pengesahan menyusul sampul yang ada', () => {
		const once = run([paragraph('Isi.')], 'cover')
		const doc = once.tr.doc.toJSON().content as JSONContent[]
		const again = run(doc, 'both')
		expect(again.outcome.ok).toBe(true)
		expect(again.outcome.message).toContain('Already there, left as is: cover')
		// "SKRIPSI" juga baris kedua halaman pengesahan; yang dihitung pembuka sampulnya.
		expect(again.outline[0]).toBe('SKRIPSI')
		expect(again.outline.filter((line) => line === 'SKRIPSI')).toHaveLength(2)
		expect(again.outline.filter((line) => line === 'HALAMAN PENGESAHAN')).toHaveLength(1)
		const cover = again.outline.indexOf('SKRIPSI')
		const approval = again.outline.indexOf('HALAMAN PENGESAHAN')
		expect(approval).toBeGreaterThan(cover)

		const third = run(again.tr.doc.toJSON().content as JSONContent[], 'both')
		expect(third.outcome.ok).toBe(false)
	})

	test('tabel isiannya tetap polos di skema editor', () => {
		const { tr } = run([paragraph('Isi.')], 'approval')
		let border: unknown
		tr.doc.descendants((node) => {
			if (node.type.name === 'table') border = node.attrs.borderStyle
			return true
		})
		expect(border).toBe('none')
	})
})
