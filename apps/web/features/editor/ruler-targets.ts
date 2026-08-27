'use client'

import type { Editor } from '@tiptap/react'
import { NodeSelection } from '@tiptap/pm/state'
import type { Node as PMNode } from '@tiptap/pm/model'
import { useEffect, useState } from 'react'
import { columnGapOf, columnLayoutKey, COLUMNS_NODE, resolveColumnSlots } from './columns'
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
	pos: number
	count: number
	gap: number
	widths: number[]
	active?: { left: number; width: number }
}

export type RulerTarget = TableRulerTarget | ImageRulerTarget | ColumnsRulerTarget | null

function locateColumns(editor: Editor): { pos: number; node: PMNode } | null {
	const { $from } = editor.state.selection
	for (let depth = $from.depth; depth > 0; depth--) {
		const node = $from.node(depth)
		if (node.type.name === COLUMNS_NODE) return { pos: $from.before(depth), node }
	}
	return null
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

	const columns = locateColumns(editor)
	if (!columns) return null

	const dom = editor.view.nodeDOM(columns.pos)
	if (!(dom instanceof HTMLElement)) return null

	const count = Math.max(2, Number(columns.node.attrs.count) || 2)
	const gap = typeof columns.node.attrs.gap === 'number' ? columns.node.attrs.gap : columnGapOf(dom)
	const slots = resolveColumnSlots(dom.clientWidth, count, gap, columns.node.attrs.widths ?? null)
	if (slots.length === 0) return null
	const plan = columnLayoutKey.getState(editor.state)?.plans.find((entry) => entry.pos === columns.pos)
	const item = plan?.items.find(
		(entry) => selection.from >= entry.pos && selection.from < entry.pos + entry.nodeSize,
	)
	const active = item ? slots.find((slot) => Math.abs(slot.left - item.left) < 1) : undefined

	return {
		kind: 'columns',
		pos: columns.pos,
		count,
		gap,
		widths: slots.map((slot) => slot.width),
		active: active ? { left: active.left, width: active.width } : undefined,
	}
}

function same(a: RulerTarget, b: RulerTarget): boolean {
	if (a === null || b === null) return a === b
	if (a.kind !== b.kind) return false
	if (a.kind === 'image' && b.kind === 'image') {
		return a.pos === b.pos && a.align === b.align && a.offsetX === b.offsetX && a.width === b.width
	}
	if (a.kind === 'table' && b.kind === 'table') {
		return (
			a.tablePos === b.tablePos &&
			a.indentLeft === b.indentLeft &&
			a.widths.length === b.widths.length &&
			a.widths.every((width, index) => width === b.widths[index])
		)
	}
	if (a.kind === 'columns' && b.kind === 'columns') {
		return (
			a.pos === b.pos &&
			a.count === b.count &&
			a.gap === b.gap &&
			a.widths.length === b.widths.length &&
			a.widths.every((width, index) => width === b.widths[index]) &&
			a.active?.left === b.active?.left &&
			a.active?.width === b.active?.width
		)
	}
	return false
}

export function useRulerTarget(editor: Editor | null): RulerTarget {
	const [target, setTarget] = useState<RulerTarget>(null)

	useEffect(() => {
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
	}, [editor])

	return target
}
