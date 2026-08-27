'use client'

import type { Editor } from '@tiptap/react'
import { useCallback, useEffect, useRef, useState } from 'react'
import {
	createTableHandlesPlugin,
	type HandleAxis,
	type HandleOpen,
	type TableHandlesOptions,
	tableHandlesKey,
} from '@/features/editor/table-handles'
import {
	insertColAfter,
	insertRowAfter,
	locateTable,
	moveColumn,
	moveRow,
	selectColumn,
	selectRow,
	targetCell,
} from '@/features/editor/table-ops'
import { TableMenu, type TableMenuState } from './table-menu'

export function TableControls({ editor }: { editor: Editor | null }) {
	const [menu, setMenu] = useState<TableMenuState | null>(null)
	const frozenRef = useRef(false)
	const openMenuRef = useRef<(open: HandleOpen) => void>(() => {})
	openMenuRef.current = (open) => {
		if (!editor) return
		frozenRef.current = true
		if (open.origin === 'row') selectRow(editor, open.tablePos, open.rowIndex)
		else if (open.origin === 'col') selectColumn(editor, open.tablePos, open.colIndex)
		else targetCell(editor, open)
		setMenu(open)
	}

	const insertRef = useRef<(axis: HandleAxis, tablePos: number, index: number) => void>(() => {})
	insertRef.current = (axis, tablePos, index) => {
		if (!editor) return
		if (axis === 'row') insertRowAfter(editor, { tablePos, rowIndex: index, colIndex: 0 })
		else insertColAfter(editor, { tablePos, rowIndex: 0, colIndex: index })
	}

	const moveRef = useRef<(axis: HandleAxis, tablePos: number, from: number, to: number) => void>(() => {})
	moveRef.current = (axis, tablePos, from, to) => {
		if (!editor) return
		if (axis === 'row') moveRow(editor, { tablePos, rowIndex: from, colIndex: 0 }, to)
		else moveColumn(editor, { tablePos, rowIndex: 0, colIndex: from }, to)
	}

	const closeMenu = useCallback(() => {
		frozenRef.current = false
		setMenu(null)
	}, [])
	useEffect(() => {
		if (!editor) return
		const opts: TableHandlesOptions = {
			onMenu: (open) => openMenuRef.current(open),
			onInsert: (axis, tablePos, index) => insertRef.current(axis, tablePos, index),
			onMove: (axis, tablePos, from, to) => moveRef.current(axis, tablePos, from, to),
			isFrozen: () => frozenRef.current,
		}
		editor.registerPlugin(createTableHandlesPlugin(opts))
		return () => {
			editor.unregisterPlugin(tableHandlesKey)
		}
	}, [editor])
	useEffect(() => {
		if (!editor) return
		const dom = editor.view.dom
		const onContext = (e: MouseEvent) => {
			const target = e.target as HTMLElement | null
			const cell = target?.closest('td, th')
			if (!cell || !dom.contains(cell)) return
			let loc: ReturnType<typeof locateTable> = null
			try {
				loc = locateTable(editor, editor.view.posAtDOM(cell, 0))
			} catch {
				return
			}
			if (!loc) return
			e.preventDefault()
			frozenRef.current = true
			targetCell(editor, loc, editor.view.posAtCoords({ left: e.clientX, top: e.clientY })?.pos)
			const rect = cell.getBoundingClientRect()
			setMenu({
				origin: 'cell',
				...loc,
				anchor: cell as HTMLElement,
				offset: { x: e.clientX - rect.left, y: e.clientY - rect.top },
			})
		}
		dom.addEventListener('contextmenu', onContext)
		return () => dom.removeEventListener('contextmenu', onContext)
	}, [editor])
	useEffect(() => {
		if (!menu) return
		const onPointer = (e: PointerEvent) => {
			const target = e.target as HTMLElement | null
			if (!target?.closest('.table-menu')) closeMenu()
		}
		document.addEventListener('pointerdown', onPointer)
		return () => document.removeEventListener('pointerdown', onPointer)
	}, [menu, closeMenu])

	if (!editor) return null

	return menu ? <TableMenu editor={editor} menu={menu} onClose={closeMenu} /> : null
}
