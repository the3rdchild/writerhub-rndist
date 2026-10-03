import { describe, expect, test } from 'bun:test'
import type { JSONContent } from '@tiptap/core'
import { buildSchema } from '@/features/sync/serialize'
import { footnoteEntries } from './footnote'
import { assignFootnotes, type FootnoteSizes, notesHeight } from './footnote-layout'
import { pageGeometry } from './page-geometry'
import { computeSpacers, type Measurement } from './pagination'

const geometry = pageGeometry() // A4, margin 1 inci
const { contentHeight, pageStride } = geometry

/** Blok-blok bertinggi tertentu; `notes` = posisi rujukan di blok itu. */
function layout(items: Array<{ height: number; notes?: number[] } | 'break'>): Measurement[] {
	let top = 0
	return items.map((item, index) => {
		const height = item === 'break' ? 0 : item.height
		const block: Measurement = {
			pos: index * 10,
			top,
			bottom: top + height,
			isBreak: item === 'break',
			kind: 'block',
			...(item !== 'break' && item.notes ? { footnotes: item.notes } : {}),
		}
		top += height
		return block
	})
}

const sizes = (heights: Record<number, number>, separator = 12): FootnoteSizes => ({
	heights: new Map(Object.entries(heights).map(([pos, height]) => [Number(pos), height])),
	separator,
})

describe('notesHeight', () => {
	test('pemisah dihitung sekali, ditambah tinggi tiap catatan', () => {
		expect(notesHeight([1, 2], sizes({ 1: 20, 2: 30 }))).toBe(62)
		expect(notesHeight([], sizes({ 1: 20 }))).toBe(0)
		expect(notesHeight([1], undefined)).toBe(0)
	})
})

describe('assignFootnotes', () => {
	test('rujukan menempel ke blok terukur yang memuatnya', () => {
		const blocks = layout([{ height: 10 }, { height: 10 }, { height: 10 }])
		assignFootnotes(blocks, [3, 12, 15, 25])
		expect(blocks.map((block) => block.footnotes ?? [])).toEqual([[3], [12, 15], [25]])
	})
})

describe('computeSpacers dengan catatan kaki (TKS-1)', () => {
	test('blok yang muat sendiri tapi tidak muat bersama catatannya turun ke lembar berikutnya', () => {
		const footnotes = sizes({ 15: 100 })
		const blocks = layout([{ height: contentHeight - 150 }, { height: 100, notes: [15] }])
		const without = computeSpacers(blocks, geometry)
		expect(without.pageCount).toBe(1)

		const withNotes = computeSpacers(blocks, geometry, [], null, footnotes)
		expect(withNotes.pageCount).toBe(2)
		expect(withNotes.spacers.map((spacer) => spacer.pos)).toEqual([10])
		// Lembar 1 tidak punya catatan; catatannya ikut ke lembar 2 (area penutup).
		expect(withNotes.spacers[0].notes).toBeUndefined()
		expect(withNotes.trailingNotes?.refs).toEqual([15])
	})

	test('spacer yang menutup lembar membawa catatan lembar itu, duduk di dasarnya', () => {
		const footnotes = sizes({ 5: 40 })
		const blocks = layout([{ height: 200, notes: [5] }, { height: contentHeight - 300 }, { height: 200 }])
		const { spacers, pageCount, trailingNotes } = computeSpacers(blocks, geometry, [], null, footnotes)
		expect(pageCount).toBe(2)
		const spacer = spacers.find((entry) => entry.pos === 20)
		expect(spacer?.notes?.refs).toEqual([5])
		const area = 12 + 40
		expect(spacer?.notes?.height).toBe(area)
		// Aliran berhenti di contentHeight - 100; area berakhir tepat di dasar lembar.
		expect(spacer?.notes?.before).toBe(contentHeight - area - (contentHeight - 100))
		// Blok berikutnya tetap mulai di awal lembar 2.
		expect((blocks[2].top + (spacer?.height ?? 0)) % pageStride).toBe(0)
		expect(trailingNotes).toBeUndefined()
	})

	test('catatan lembar yang ditutup pemenggal paksa digambar sebelum pemenggal', () => {
		const footnotes = sizes({ 5: 30 })
		const blocks = layout([{ height: 100, notes: [5] }, 'break', { height: 100 }])
		const { spacers } = computeSpacers(blocks, geometry, [], null, footnotes)
		const notesOnly = spacers.find((spacer) => spacer.notesOnly)
		expect(notesOnly?.pos).toBe(10)
		expect(notesOnly?.notes?.refs).toEqual([5])
		expect(notesOnly?.height).toBe(contentHeight - 100)
		// Spacer blok sesudah pemenggal tidak membawa catatan lagi.
		expect(spacers.find((spacer) => spacer.pos === 20)?.notes).toBeUndefined()
	})

	test('catatan lembar terakhir menjadi area penutup', () => {
		const footnotes = sizes({ 5: 30, 15: 20 })
		const blocks = layout([
			{ height: 100, notes: [5] },
			{ height: 100, notes: [15] },
		])
		const { spacers, trailingNotes } = computeSpacers(blocks, geometry, [], null, footnotes)
		expect(spacers).toEqual([])
		expect(trailingNotes?.refs).toEqual([5, 15])
		expect(trailingNotes?.afterPos).toBe(10)
		expect(trailingNotes?.height).toBe(62)
	})
})

describe('footnoteEntries', () => {
	test('nomor mengikuti urutan rujukan, isi diambil dari atributnya', () => {
		const ref = (id: string, text: string): JSONContent => ({
			type: 'footnoteRef',
			attrs: { id, content: [{ type: 'text', text }] },
		})
		const doc = buildSchema().nodeFromJSON({
			type: 'doc',
			content: [
				{ type: 'paragraph', content: [{ type: 'text', text: 'A' }, ref('b', 'kedua')] },
				{ type: 'paragraph', content: [ref('a', 'pertama'), { type: 'text', text: 'B' }] },
			],
		})
		expect(footnoteEntries(doc).map((entry) => [entry.number, entry.id, entry.content[0]?.text])).toEqual([
			[1, 'b', 'kedua'],
			[2, 'a', 'pertama'],
		])
	})
})
