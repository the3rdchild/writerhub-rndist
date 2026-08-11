'use client'

import type { Editor } from '@tiptap/react'
import { NodeSelection } from '@tiptap/pm/state'
import { useEffect, useState } from 'react'
import { columnWidths, locateTable } from './table-ops'

/**
 * Apa yang sedang bisa diatur lewat penggaris selain paragraf.
 *
 * Penggaris menggambar tiga hal berbeda di satu batang: margin lembar,
 * indentasi paragraf, dan - lewat modul ini - geometri tabel atau posisi
 * gambar yang sedang aktif. Deteksinya dipisah ke sini supaya komponen
 * penggaris tetap mengurus penggambaran saja.
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

export type RulerTarget = TableRulerTarget | ImageRulerTarget | null

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
	if (!table) return null
	const widths = columnWidths(editor, table.tablePos)
	if (!widths || widths.length === 0) return null
	const node = editor.state.doc.nodeAt(table.tablePos)
	return {
		kind: 'table',
		tablePos: table.tablePos,
		indentLeft: Number(node?.attrs.indentLeft) || 0,
		widths,
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
