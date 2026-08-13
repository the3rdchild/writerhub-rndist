'use client'

import type { Editor } from '@tiptap/react'
import { NodeSelection } from '@tiptap/pm/state'
import type { Node as PMNode } from '@tiptap/pm/model'
import { useEffect, useState } from 'react'
import { columnGapOf, columnLayoutKey, COLUMNS_NODE, resolveColumnSlots } from './columns'
import { columnWidths, locateTable } from './table-ops'

/**
 * Apa yang sedang bisa diatur lewat penggaris selain paragraf.
 *
 * Penggaris menggambar tiga hal berbeda di satu batang: margin lembar,
 * indentasi paragraf, dan - lewat modul ini - geometri tabel, posisi gambar,
 * atau lebar kolom yang sedang aktif. Deteksinya dipisah ke sini supaya
 * komponen penggaris tetap mengurus penggambaran saja.
 *
 * Pengukuran DOM (lebar kolom tabel, lebar gambar) sengaja dilakukan di dalam
 * pelanggan transaksi, bukan saat render: membaca `offsetWidth` di tengah
 * render memaksa layout sinkron pada tiap ketukan tombol.
 */

export interface TableRulerTarget {
	kind: 'table'
	/** Posisi tepat sebelum node tabel. */
	tablePos: number
	/** Jarak tabel dari tepi kiri area konten, piksel dokumen. */
	indentLeft: number
	/** Lebar tiap kolom, piksel dokumen. */
	widths: number[]
}

export interface ImageRulerTarget {
	kind: 'image'
	pos: number
	align: 'left' | 'center' | 'right' | null
	/** Posisi bebas dari tepi kiri konten; `null` berarti mengikuti `align`. */
	offsetX: number | null
	/** Lebar terpasang gambar, piksel dokumen. */
	width: number
}

/** Blok kolom yang sedang aktif, untuk penanda lebar & celah kolom (§P5). */
export interface ColumnsRulerTarget {
	kind: 'columns'
	/** Posisi tepat sebelum node `columns`. */
	pos: number
	count: number
	/** Celah antar kolom efektif, piksel dokumen (atribut atau CSS). */
	gap: number
	/** Lebar tiap kolom, piksel dokumen. */
	widths: number[]
	/** Kolom tempat kursor berada - penanda indentasi diikat ke sini. */
	active?: { left: number; width: number }
}

export type RulerTarget = TableRulerTarget | ImageRulerTarget | ColumnsRulerTarget | null

/** Blok `columns` yang memuat seleksi, sejajar dengan `locateTable`. */
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

	// Gambar hanya bisa jadi sasaran saat node-nya sendiri yang terpilih -
	// kursor di paragraf sebelahnya bukan berarti gambarnya sedang diatur.
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

	// Kolom tempat kursor berada, dibaca dari rencana tata letak yang sedang
	// berlaku: penanda indentasi paragraf diikat ke batasnya (§P5 butir 4).
	const plan = columnLayoutKey.getState(editor.state)?.plans.find((entry) => entry.pos === columns.pos)
	const item = plan?.items.find((entry) => selection.from >= entry.pos && selection.from < entry.pos + entry.nodeSize)
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

/** Sasaran penggaris saat ini, mengikuti seleksi editor. */
export function useRulerTarget(editor: Editor | null): RulerTarget {
	const [target, setTarget] = useState<RulerTarget>(null)

	useEffect(() => {
		if (!editor) {
			setTarget(null)
			return
		}
		// Dibandingkan dulu sebelum disimpan: tanpa ini tiap transaksi - termasuk
		// tiap ketukan tombol - menghasilkan objek baru dan me-render ulang
		// seluruh penggaris.
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
