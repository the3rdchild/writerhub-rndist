import { describe, expect, test } from 'bun:test'
import type { JSONContent } from '@tiptap/core'
import { EditorState } from '@tiptap/pm/state'
import { buildSchema } from '@/features/sync/serialize'
import {
	BODY_NUMBERING,
	firstChapterPos,
	numberingCustomized,
	placeAcademicNumbering,
} from './academic-numbering'

const schema = buildSchema()
const heading = (level: number, text: string): JSONContent => ({
	type: 'heading',
	attrs: { level },
	content: [{ type: 'text', text }],
})
const paragraph = (text: string): JSONContent => ({ type: 'paragraph', content: [{ type: 'text', text }] })
const pageBreak: JSONContent = { type: 'pageBreak' }

function run(blocks: JSONContent[]) {
	const state = EditorState.create({ doc: schema.nodeFromJSON({ type: 'doc', content: blocks }) })
	const tr = state.tr
	const placement = placeAcademicNumbering(tr, schema)
	const outline: string[] = []
	tr.doc.forEach((node) => {
		if (node.type.name === 'sectionBreak') outline.push(`§${JSON.stringify(node.attrs.pageSetup)}`)
		else if (node.type.name === 'pageBreak') outline.push('⤓')
		else outline.push(node.textContent)
	})
	return { placement, outline, doc: tr.doc }
}

describe('penomoran karya ilmiah', () => {
	test('pemisah bagian tepat di depan BAB I, menggantikan pemenggal halaman di sana', () => {
		const { placement, outline } = run([
			paragraph('SKRIPSI'),
			pageBreak,
			heading(1, 'KATA PENGANTAR'),
			paragraph('Puji syukur.'),
			pageBreak,
			heading(1, 'BAB I PENDAHULUAN'),
			paragraph('Isi.'),
		])
		expect(placement).toEqual({ ok: true, front: true, cover: true })
		expect(outline).toEqual([
			'SKRIPSI',
			'⤓',
			'KATA PENGANTAR',
			'Puji syukur.',
			`§${JSON.stringify({ pageNumbering: BODY_NUMBERING })}`,
			'BAB I PENDAHULUAN',
			'Isi.',
		])
	})

	test('pemisah bagian yang sudah ada dipakai ulang, tata letaknya tetap', () => {
		const { outline } = run([
			heading(1, 'ABSTRAK'),
			paragraph('Ringkas.'),
			{
				type: 'sectionBreak',
				attrs: { pageSetup: { orientation: 'portrait' }, columns: null, continuous: true },
			},
			heading(1, 'BAB 1 PENDAHULUAN'),
		])
		expect(outline[2]).toBe(`§${JSON.stringify({ orientation: 'portrait', pageNumbering: BODY_NUMBERING })}`)
		expect(outline.filter((line) => line.startsWith('§'))).toHaveLength(1)
	})

	test('tanpa bagian depan tidak ada pemisah; tanpa BAB I tidak ada apa-apa', () => {
		expect(run([heading(1, 'BAB I PENDAHULUAN'), paragraph('Isi.')]).placement).toEqual({
			ok: true,
			front: false,
			cover: false,
		})
		expect(run([heading(1, 'KATA PENGANTAR'), paragraph('Isi.')]).placement).toEqual({
			ok: false,
			reason: 'no-chapter',
		})
	})

	test('"PENDAHULUAN" tanpa kata BAB juga awal badan naskah; "BAB II" bukan', () => {
		const doc = (text: string) =>
			schema.nodeFromJSON({ type: 'doc', content: [paragraph('x'), heading(1, text)] })
		expect(firstChapterPos(doc('PENDAHULUAN'))).not.toBeNull()
		expect(firstChapterPos(doc('BAB II TINJAUAN PUSTAKA'))).toBeNull()
		expect(firstChapterPos(doc('BAB IV HASIL'))).toBeNull()
	})

	test('penomoran yang sudah diatur tidak dianggap bawaan', () => {
		const plain = schema.nodeFromJSON({ type: 'doc', content: [paragraph('x')] })
		expect(numberingCustomized(plain, undefined)).toBe(false)
		expect(numberingCustomized(plain, { format: 'decimal', restart: 'continue' })).toBe(false)
		expect(numberingCustomized(plain, { format: 'lower-roman', restart: 'continue' })).toBe(true)
		expect(numberingCustomized(run([paragraph('x'), heading(1, 'BAB I')]).doc, undefined)).toBe(true)
	})
})
