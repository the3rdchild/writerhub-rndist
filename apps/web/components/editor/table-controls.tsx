'use client'

import type { Editor } from '@tiptap/react'
import { useEffect, useRef, useState } from 'react'
import {
	insertColAfter,
	insertRowAfter,
	locateTable,
	moveColumn,
	moveRow,
	selectColumn,
	selectRow,
} from '@/features/editor/table-ops'
import {
	type HandleAxis,
	type HandleOpen,
	createTableHandlesPlugin,
	tableHandlesKey,
	type TableHandlesOptions,
} from '@/features/editor/table-handles'
import { TableMenu, type TableMenuState } from './table-menu'

/**
 * Lapisan interaksi tabel: handle baris/kolom + menu konteks (grip, tombol •••,
 * atau klik kanan) + seret untuk menyusun ulang.
 *
 * Menggantikan bilah kontrol tabel yang dulu muncul di atas ruler - kini
 * seluruh kontrol hidup DI tabel itu sendiri: handle muncul di tepi kiri
 * (baris) dan di pojok sel baris pertama (kolom) saat hover.
 *
 * Plugin dekorasi didaftarkan dari sini, bukan dari buildEditorExtensions,
 * supaya callback-nya (yang memperbarui state React) bisa diperbarui tiap
 * render lewat ref tanpa membangun ulang ekstensi editor.
 */
export function TableControls({ editor }: { editor: Editor | null }) {
	const [menu, setMenu] = useState<TableMenuState | null>(null)

	// Callback plugin disimpan di ref agar plugin (didirikan sekali) selalu
	// memanggil versi terbaru tanpa perlu didaftarkan ulang.
	const openMenuRef = useRef<(open: HandleOpen) => void>(() => {})
	openMenuRef.current = (open) => {
		if (!editor) return
		// Buka dari handle = pilih sekalian baris/kolomnya, supaya perintah yang
		// bekerja atas seleksi (gabung sel, kepala, perataan) langsung bermakna.
		if (open.axis === 'row') selectRow(editor, open.tablePos, open.rowIndex)
		else selectColumn(editor, open.tablePos, open.colIndex)
		setMenu(open)
	}

	const insertRef = useRef<(axis: HandleAxis, tablePos: number, index: number) => void>(() => {})
	insertRef.current = (axis, tablePos, index) => {
		if (!editor) return
		if (axis === 'row') insertRowAfter(editor, { tablePos, rowIndex: index, colIndex: 0 })
		else insertColAfter(editor, { tablePos, rowIndex: 0, colIndex: index })
	}

	// Seret handle untuk menyusun ulang baris/kolom.
	const moveRef = useRef<(axis: HandleAxis, tablePos: number, from: number, to: number) => void>(() => {})
	moveRef.current = (axis, tablePos, from, to) => {
		if (!editor) return
		if (axis === 'row') moveRow(editor, { tablePos, rowIndex: from, colIndex: 0 }, to)
		else moveColumn(editor, { tablePos, rowIndex: 0, colIndex: from }, to)
	}

	// Daftarkan plugin handle ke editor (sekali per instance editor).
	useEffect(() => {
		if (!editor) return
		const opts: TableHandlesOptions = {
			onMenu: (open) => openMenuRef.current(open),
			onInsert: (axis, tablePos, index) => insertRef.current(axis, tablePos, index),
			onMove: (axis, tablePos, from, to) => moveRef.current(axis, tablePos, from, to),
		}
		editor.registerPlugin(createTableHandlesPlugin(opts))
		return () => {
			editor.unregisterPlugin(tableHandlesKey)
		}
	}, [editor])

	// Klik kanan pada sel tabel memunculkan menu untuk sel itu.
	useEffect(() => {
		if (!editor) return
		const dom = editor.view.dom
		const onContext = (e: MouseEvent) => {
			const target = e.target as HTMLElement | null
			const cell = target?.closest('td, th')
			if (!cell || !dom.contains(cell)) return
			// Posisi diambil dari DOM sel-nya, bukan dari koordinat penunjuk: klik
			// di padding sel tetap menunjuk sel yang benar.
			const inCell = editor.view.posAtDOM(cell, 0)
			const loc = locateTable(editor, inCell)
			if (!loc) return
			e.preventDefault()
			const rect = cell.getBoundingClientRect()
			setMenu({
				axis: 'row',
				...loc,
				anchor: cell as HTMLElement,
				// Muncul di penunjuk, tapi tetap terjangkar ke selnya saat digulir.
				offset: { x: e.clientX - rect.left, y: e.clientY - rect.top },
			})
		}
		dom.addEventListener('contextmenu', onContext)
		return () => dom.removeEventListener('contextmenu', onContext)
	}, [editor])

	// Tutup menu saat klik di luar.
	useEffect(() => {
		if (!menu) return
		const onPointer = (e: PointerEvent) => {
			const target = e.target as HTMLElement | null
			if (!target?.closest('.table-menu')) setMenu(null)
		}
		document.addEventListener('pointerdown', onPointer)
		return () => document.removeEventListener('pointerdown', onPointer)
	}, [menu])

	if (!editor) return null

	return menu ? <TableMenu editor={editor} menu={menu} onClose={() => setMenu(null)} /> : null
}
