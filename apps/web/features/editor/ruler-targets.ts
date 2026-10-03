'use client'

import { NodeSelection } from '@tiptap/pm/state'
import type { Editor } from '@tiptap/react'
import { useEffect, useState } from 'react'
import { resolveColumnSlots } from './column-flow'
import { FALLBACK_COLUMN_GAP } from './column-measure'
import { columnLayoutKey } from './columns'
import { DEFAULT_PAGE_SETUP, pageGeometry } from './page-geometry'
import { paginationKey } from './pagination'
import { tabStopsAt } from './ruler-tabs'
import { columnRegions } from './section-break'
import type { TabStop } from './tab-stops'
import { columnWidths, locateTable } from './table-ops'

export interface TableRulerTarget {
	kind: 'table'
	tablePos: number
	indentLeft: number
	widths: number[]
}

export interface ImageRulerTarget {
	kind: 'image'
	pos: number
	align: 'left' | 'center' | 'right' | null
	offsetX: number | null
	width: number
}

export interface ColumnsRulerTarget {
	kind: 'columns'
	/** Posisi pembatas section pembuka wilayah - sasaran `setColumnsLayout`. */
	pos: number
	count: number
	/** Lebar tiap kolom (px) pada lebar teks section-nya. */
	widths: number[]
	/** Jarak tiap celah (px), panjang `count - 1`. */
	gaps: number[]
	/** Lebar kolom belum pernah diatur: kolom rata. */
	equal: boolean
	/** Kolom tempat kursor berada - acuan penanda indentasi. */
	active?: { left: number; width: number }
}

export type RulerTarget = TableRulerTarget | ImageRulerTarget | ColumnsRulerTarget | null

/**
 * Wilayah berkolom (section) di sekitar kursor - sasaran penanda kolom di
 * penggaris (KOL-11). Kolom lama berbasis node `columns` dimigrasikan saat
 * dibuka, jadi hanya section yang perlu dikenali.
 */
function readColumns(editor: Editor): ColumnsRulerTarget | null {
	const { state } = editor
	const setup = paginationKey.getState(state)?.setup ?? DEFAULT_PAGE_SETUP
	const head = state.selection.head
	const region = columnRegions(state.doc, setup).find((entry) => head >= entry.from && head <= entry.to)
	const columns = region?.span.columns
	if (!region || !columns || columns.count < 2) return null

	const width = pageGeometry(region.span.setup).contentWidth
	const count = Math.max(2, columns.count)
	const gap = typeof columns.gap === 'number' && columns.gap >= 0 ? columns.gap : FALLBACK_COLUMN_GAP
	const slots = resolveColumnSlots(width, count, gap, columns.widths ?? null, columns.gaps ?? null)
	if (slots.length === 0) return null

	/* Kolom berkursor dibaca dari rencana tata letak: potongan blok tempat
	 * kepala seleksi berada. */
	let active: ColumnsRulerTarget['active']
	const layout = columnLayoutKey.getState(state)
	const plan = layout?.plans.find((entry) => entry.pos === region.from)
	const item = plan?.items.find((entry) => head >= entry.pos && head <= entry.pos + entry.nodeSize)
	if (plan && item && item.fragments.length > 0) {
		const fragment = item.fragments[layout?.active.get(item.pos) ?? 0] ?? item.fragments[0]
		const boxLeft = Math.min(...plan.items.flatMap((entry) => entry.fragments.map((part) => part.left)))
		const slot = slots.find((candidate) => Math.abs(candidate.left - (fragment.left - boxLeft)) < 1)
		if (slot) active = { left: slot.left, width: slot.width }
	}

	return {
		kind: 'columns',
		pos: region.span.pos,
		count,
		widths: slots.map((slot) => slot.width),
		gaps: slots.slice(1).map((slot, index) => slot.left - (slots[index].left + slots[index].width)),
		equal: !columns.widths,
		active,
	}
}

function readTarget(editor: Editor): RulerTarget {
	const { selection } = editor.state
	if (selection instanceof NodeSelection && selection.node.type.name === 'image') {
		const pos = selection.from
		const dom = editor.view.nodeDOM(pos)
		const img = dom instanceof HTMLElement ? dom.querySelector('img') : null
		const width = img?.offsetWidth || Number(selection.node.attrs.width) || 0
		return {
			kind: 'image',
			pos,
			align: (selection.node.attrs.align as ImageRulerTarget['align']) ?? null,
			offsetX: (selection.node.attrs.offsetX as number | null) ?? null,
			width,
		}
	}

	const table = locateTable(editor)
	if (table) {
		const widths = columnWidths(editor, table.tablePos)
		if (widths && widths.length > 0) {
			const node = editor.state.doc.nodeAt(table.tablePos)
			return {
				kind: 'table',
				tablePos: table.tablePos,
				indentLeft: Number(node?.attrs.indentLeft) || 0,
				widths,
			}
		}
	}

	return readColumns(editor)
}

const sameList = (a: readonly number[], b: readonly number[]) =>
	a.length === b.length && a.every((value, index) => Math.abs(value - b[index]) < 0.01)

function same(a: RulerTarget, b: RulerTarget): boolean {
	if (a === null || b === null) return a === b
	if (a.kind !== b.kind) return false
	if (a.kind === 'image' && b.kind === 'image') {
		return a.pos === b.pos && a.align === b.align && a.offsetX === b.offsetX && a.width === b.width
	}
	if (a.kind === 'table' && b.kind === 'table') {
		return a.tablePos === b.tablePos && a.indentLeft === b.indentLeft && sameList(a.widths, b.widths)
	}
	if (a.kind === 'columns' && b.kind === 'columns') {
		return (
			a.pos === b.pos &&
			a.count === b.count &&
			a.equal === b.equal &&
			sameList(a.widths, b.widths) &&
			sameList(a.gaps, b.gaps) &&
			a.active?.left === b.active?.left &&
			a.active?.width === b.active?.width
		)
	}
	return false
}

export function useRulerTarget(editor: Editor | null): RulerTarget {
	const [target, setTarget] = useState<RulerTarget>(null)

	useEffect(
		function syncRulerTarget() {
			if (!editor) {
				setTarget(null)
				return
			}
			const sync = () => {
				const next = readTarget(editor)
				setTarget((current) => (same(current, next) ? current : next))
			}
			sync()
			editor.on('transaction', sync)
			return () => {
				editor.off('transaction', sync)
			}
		},
		[editor],
	)

	return target
}

/** Tab stop paragraf di kursor - penanda tab stop di penggaris (TKS-18). */
export function useTabStops(editor: Editor | null): TabStop[] {
	const [stops, setStops] = useState<TabStop[]>([])

	useEffect(
		function syncTabStops() {
			if (!editor) {
				setStops([])
				return
			}
			const sync = () => {
				const next = tabStopsAt(editor.state)
				setStops((current) =>
					current.length === next.length &&
					current.every((stop, index) => stop.posPt === next[index].posPt && stop.type === next[index].type)
						? current
						: next,
				)
			}
			sync()
			editor.on('transaction', sync)
			return () => {
				editor.off('transaction', sync)
			}
		},
		[editor],
	)

	return stops
}
