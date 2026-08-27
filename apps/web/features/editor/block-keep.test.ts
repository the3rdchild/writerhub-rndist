import { describe, expect, test } from 'bun:test'
import { getSchema } from '@tiptap/core'
import type { Attribute } from '@tiptap/core'
import { EditorState, TextSelection } from '@tiptap/pm/state'
import type { Editor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { applyBlockKeep, BlockKeep, blockKeepAt, DEFAULT_WIDOW_CONTROL } from './block-keep'

const schema = getSchema([StarterKit, BlockKeep])

/** Atribut keep yang terdaftar lewat addGlobalAttributes. */
function keepAttributes(): Record<string, Attribute> {
	const groups = BlockKeep.config.addGlobalAttributes?.() ?? []
	return groups[0].attributes
}

function fakeElement(style: Record<string, string>): HTMLElement {
	return { style } as unknown as HTMLElement
}

function stateWith(text: string): EditorState {
	const doc = schema.node('doc', null, [
		schema.node('paragraph', null, text ? [schema.text(text)] : []),
		schema.node('paragraph', null, []),
	])
	return EditorState.create({ schema, doc })
}

describe('atribut keep', () => {
	test('keempat atribut terpasang pada paragraph, heading, dan blockquote', () => {
		for (const name of ['paragraph', 'heading', 'blockquote']) {
			const attrs = Object.keys(schema.nodes[name]?.spec.attrs ?? {})
			expect(attrs).toContain('keepWithNext')
			expect(attrs).toContain('keepLines')
			expect(attrs).toContain('widowControl')
			expect(attrs).toContain('pageBreakBefore')
		}
	})

	test('baku: semuanya mati kecuali widowControl (seperti Google)', () => {
		const paragraph = schema.nodes.paragraph.create()
		expect(paragraph.attrs.keepWithNext).toBe(false)
		expect(paragraph.attrs.keepLines).toBe(false)
		expect(paragraph.attrs.widowControl).toBe(true)
		expect(paragraph.attrs.pageBreakBefore).toBe(false)
	})
})

describe('renderHTML', () => {
	test('tiap atribut menyumbang deklarasi CSS-nya sendiri', () => {
		const attrs = keepAttributes()
		expect(attrs.keepWithNext.renderHTML?.({ keepWithNext: true })).toEqual({
			style: 'break-after: avoid',
		})
		expect(attrs.keepLines.renderHTML?.({ keepLines: true })).toEqual({ style: 'break-inside: avoid' })
		expect(attrs.pageBreakBefore.renderHTML?.({ pageBreakBefore: true })).toEqual({
			style: 'break-before: page',
		})
	})

	test('widowControl aktif merender orphans/widows 2, nonaktif 1', () => {
		const attrs = keepAttributes()
		expect(attrs.widowControl.renderHTML?.({ widowControl: true })).toEqual({
			style: 'orphans: 2; widows: 2',
		})
		expect(attrs.widowControl.renderHTML?.({ widowControl: false })).toEqual({
			style: 'orphans: 1; widows: 1',
		})
	})

	test('atribut yang mati tidak merender apa-apa', () => {
		const attrs = keepAttributes()
		expect(attrs.keepWithNext.renderHTML?.({ keepWithNext: false })).toEqual({})
		expect(attrs.keepLines.renderHTML?.({ keepLines: false })).toEqual({})
		expect(attrs.pageBreakBefore.renderHTML?.({ pageBreakBefore: false })).toEqual({})
	})
})

describe('parseHTML', () => {
	test('membaca deklarasi break dari style elemen', () => {
		const attrs = keepAttributes()
		expect(attrs.keepWithNext.parseHTML?.(fakeElement({ breakAfter: 'avoid' }))).toBe(true)
		expect(attrs.keepWithNext.parseHTML?.(fakeElement({}))).toBe(false)
		expect(attrs.keepLines.parseHTML?.(fakeElement({ breakInside: 'avoid' }))).toBe(true)
		expect(attrs.pageBreakBefore.parseHTML?.(fakeElement({ breakBefore: 'page' }))).toBe(true)
	})

	test('widowControl: orphans 1 berarti mati, tanpa penanda berarti aktif', () => {
		const attrs = keepAttributes()
		expect(attrs.widowControl.parseHTML?.(fakeElement({ orphans: '1' }))).toBe(false)
		expect(attrs.widowControl.parseHTML?.(fakeElement({ orphans: '2' }))).toBe(true)
		expect(attrs.widowControl.parseHTML?.(fakeElement({}))).toBe(true)
	})
})

describe('applyBlockKeep (jantung perintah setBlockKeep)', () => {
	test('menerapkan atribut ke blok yang beririsan dengan seleksi', () => {
		const state = stateWith('halo')
		const tr = state.tr

		expect(applyBlockKeep(state, tr, { keepWithNext: true, widowControl: false })).toBe(true)

		const next = state.apply(tr).doc
		expect(next.child(0).attrs.keepWithNext).toBe(true)
		expect(next.child(0).attrs.widowControl).toBe(false)
		// Atribut yang tidak disebut dibiarkan apa adanya.
		expect(next.child(0).attrs.keepLines).toBe(false)
	})

	test('seleksi rentang menyentuh semua blok di dalamnya', () => {
		const state = stateWith('halo')
		const doc = state.doc
		const ranged = state.apply(state.tr.setSelection(TextSelection.create(doc, 0, doc.content.size)))
		const tr = ranged.tr

		applyBlockKeep(ranged, tr, { keepLines: true })
		const next = ranged.apply(tr).doc
		expect(next.child(0).attrs.keepLines).toBe(true)
		expect(next.child(1).attrs.keepLines).toBe(true)
	})

	test('tidak ada perubahan bila nilai sudah sama', () => {
		const state = stateWith('halo')
		expect(applyBlockKeep(state, state.tr, { keepWithNext: false })).toBe(false)
	})
})

describe('blockKeepAt', () => {
	function editorWith(state: EditorState): Editor {
		return { state } as unknown as Editor
	}

	test('membaca nilai dari blok tempat kursor berada', () => {
		const state = stateWith('halo')
		const tr = state.tr
		applyBlockKeep(state, tr, { pageBreakBefore: true, widowControl: false })
		const editor = editorWith(state.apply(tr))

		expect(blockKeepAt(editor)).toEqual({
			keepWithNext: false,
			keepLines: false,
			widowControl: false,
			pageBreakBefore: true,
		})
	})

	test('baku widowControl aktif saat atribut belum pernah diatur', () => {
		expect(blockKeepAt(editorWith(stateWith('halo'))).widowControl).toBe(DEFAULT_WIDOW_CONTROL)
	})
})
