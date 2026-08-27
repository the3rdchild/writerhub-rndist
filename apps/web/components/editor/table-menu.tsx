'use client'

import type { Editor } from '@tiptap/react'
import {
	AlignCenter,
	AlignLeft,
	AlignRight,
	ArrowDown,
	ArrowLeft,
	ArrowRight,
	ArrowUp,
	BetweenHorizontalEnd,
	BetweenHorizontalStart,
	BetweenVerticalEnd,
	BetweenVerticalStart,
	PanelLeft,
	PanelTop,
	RectangleHorizontal,
	TableCellsMerge,
	TableCellsSplit,
	Trash2,
} from 'lucide-react'
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type JSX } from 'react'
import { createPortal } from 'react-dom'
import {
	type CellTarget,
	deleteColAt,
	deleteRowAt,
	insertColAfter,
	insertColBefore,
	insertRowAfter,
	insertRowBefore,
	moveColumn,
	moveRow,
	withCellTarget,
} from '@/features/editor/table-ops'
import { type MenuOrigin } from '@/features/editor/table-handles'
import { cn } from '@/lib/utils'

export interface TableMenuState {
	origin: MenuOrigin
	tablePos: number
	rowIndex: number
	colIndex: number
	rowCount: number
	colCount: number
	anchor: HTMLElement
	offset?: { x: number; y: number }
}

interface MenuRow {
	label: string
	icon: JSX.Element
	onClick: () => void
	disabled?: boolean
	separatorBefore?: boolean
}

const GAP = 4
const EDGE = 8

export function TableMenu({
	editor,
	menu,
	onClose,
}: {
	editor: Editor
	menu: TableMenuState
	onClose: () => void
}) {
	const { anchor, offset } = menu
	const ref = useRef<HTMLDivElement>(null)
	const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
	const [active, setActive] = useState(0)

	const items = buildItems(editor, menu, onClose)

	useEffect(() => setActive(0), [menu])
	useEffect(() => {
		const handle = anchor.closest('.table-handle')
		handle?.classList.add('table-handle--open')
		return () => handle?.classList.remove('table-handle--open')
	}, [anchor])

	const place = useCallback(() => {
		const el = ref.current
		if (!el) return
		if (!anchor.isConnected) {
			onClose()
			return
		}
		const a = anchor.getBoundingClientRect()
		const { width, height } = el.getBoundingClientRect()
		const originTop = offset ? a.top + offset.y : a.bottom + GAP
		const originBottom = offset ? a.top + offset.y : a.top
		let top = originTop
		let left = offset ? a.left + offset.x : a.left
		if (top + height > window.innerHeight - EDGE) {
			top = originBottom - height - GAP
			if (top < EDGE) top = Math.max(EDGE, window.innerHeight - height - EDGE)
		}
		if (left + width > window.innerWidth - EDGE) left = window.innerWidth - width - EDGE
		setPos({ top: Math.max(EDGE, top), left: Math.max(EDGE, left) })
	}, [anchor, offset, onClose])

	useLayoutEffect(place, [place, items.length])
	useEffect(() => {
		let frame = 0
		const onMove = () => {
			cancelAnimationFrame(frame)
			frame = requestAnimationFrame(place)
		}
		window.addEventListener('scroll', onMove, true)
		window.addEventListener('resize', onMove)
		return () => {
			cancelAnimationFrame(frame)
			window.removeEventListener('scroll', onMove, true)
			window.removeEventListener('resize', onMove)
		}
	}, [place])

	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			if (e.key === 'Escape') {
				e.preventDefault()
				onClose()
			} else if (e.key === 'ArrowDown') {
				e.preventDefault()
				setActive((i) => Math.min(i + 1, items.length - 1))
			} else if (e.key === 'ArrowUp') {
				e.preventDefault()
				setActive((i) => Math.max(i - 1, 0))
			} else if (e.key === 'Enter') {
				const item = items[active]
				if (item && !item.disabled) {
					e.preventDefault()
					item.onClick()
				}
			}
		}
		window.addEventListener('keydown', onKey)
		return () => window.removeEventListener('keydown', onKey)
	}, [items, active, onClose])

	return createPortal(
		<div
			ref={ref}
			className="table-menu fixed z-50 max-h-[70vh] min-w-[220px] overflow-y-auto rounded-xl border border-line-strong bg-surface-raised py-1 shadow-[var(--menu-shadow)]"
			style={{ top: pos?.top ?? 0, left: pos?.left ?? 0, visibility: pos ? 'visible' : 'hidden' }}
			onMouseDown={(e) => e.preventDefault()}
			onContextMenu={(e) => e.preventDefault()}
		>
			{items.map((item, i) => (
				<div key={item.label}>
					{item.separatorBefore && <div className="my-1 h-px bg-line" />}
					<button
						type="button"
						onMouseEnter={() => setActive(i)}
						onClick={item.onClick}
						disabled={item.disabled}
						className={cn(
							'flex w-full items-center gap-3 px-3 py-1.5 text-left text-sm transition-colors',
							i === active && !item.disabled
								? 'bg-accent/10 text-accent'
								: item.disabled
									? 'text-faint'
									: 'text-foreground hover:bg-[var(--overlay-hover)]',
							item.disabled && 'cursor-not-allowed',
						)}
					>
						<span className="flex h-4 w-4 shrink-0 items-center justify-center">{item.icon}</span>
						{item.label}
					</button>
				</div>
			))}
		</div>,
		document.body,
	)
}

const ICON = 'h-4 w-4'

function buildItems(editor: Editor, menu: TableMenuState, onClose: () => void): MenuRow[] {
	const { rowIndex, colIndex, rowCount, colCount } = menu
	const target: CellTarget = { tablePos: menu.tablePos, rowIndex, colIndex }

	const wrap = (fn: () => void) => () => {
		fn()
		onClose()
	}
	const onCell = (run: (e: Editor) => void) => wrap(() => withCellTarget(editor, target, run))

	return [
		{
			label: 'Add row above',
			icon: <BetweenHorizontalStart className={ICON} />,
			onClick: wrap(() => insertRowBefore(editor, target)),
		},
		{
			label: 'Add row below',
			icon: <BetweenHorizontalEnd className={ICON} />,
			onClick: wrap(() => insertRowAfter(editor, target)),
		},
		{
			label: 'Remove row',
			icon: <Trash2 className={ICON} />,
			onClick: wrap(() => deleteRowAt(editor, target)),
			disabled: rowCount <= 1,
		},
		{
			label: 'Move row up',
			icon: <ArrowUp className={ICON} />,
			onClick: wrap(() => moveRow(editor, target, rowIndex - 1)),
			disabled: rowIndex <= 0,
		},
		{
			label: 'Move row down',
			icon: <ArrowDown className={ICON} />,
			onClick: wrap(() => moveRow(editor, target, rowIndex + 1)),
			disabled: rowIndex >= rowCount - 1,
		},

		{
			label: 'Add left column',
			icon: <BetweenVerticalStart className={ICON} />,
			onClick: wrap(() => insertColBefore(editor, target)),
			separatorBefore: true,
		},
		{
			label: 'Add right column',
			icon: <BetweenVerticalEnd className={ICON} />,
			onClick: wrap(() => insertColAfter(editor, target)),
		},
		{
			label: 'Remove column',
			icon: <Trash2 className={ICON} />,
			onClick: wrap(() => deleteColAt(editor, target)),
			disabled: colCount <= 1,
		},
		{
			label: 'Move column left',
			icon: <ArrowLeft className={ICON} />,
			onClick: wrap(() => moveColumn(editor, target, colIndex - 1)),
			disabled: colIndex <= 0,
		},
		{
			label: 'Move column right',
			icon: <ArrowRight className={ICON} />,
			onClick: wrap(() => moveColumn(editor, target, colIndex + 1)),
			disabled: colIndex >= colCount - 1,
		},

		{
			label: 'Merge cells',
			icon: <TableCellsMerge className={ICON} />,
			onClick: onCell((e) => e.chain().focus().mergeCells().run()),
			separatorBefore: true,
		},
		{
			label: 'Split cell',
			icon: <TableCellsSplit className={ICON} />,
			onClick: onCell((e) => e.chain().focus().splitCell().run()),
		},

		{
			label: 'Align cell left',
			icon: <AlignLeft className={ICON} />,
			onClick: onCell((e) => e.chain().focus().setCellAttribute('textAlign', 'left').run()),
			separatorBefore: true,
		},
		{
			label: 'Align cell center',
			icon: <AlignCenter className={ICON} />,
			onClick: onCell((e) => e.chain().focus().setCellAttribute('textAlign', 'center').run()),
		},
		{
			label: 'Align cell right',
			icon: <AlignRight className={ICON} />,
			onClick: onCell((e) => e.chain().focus().setCellAttribute('textAlign', 'right').run()),
		},

		{
			label: 'Toggle header row',
			icon: <PanelTop className={ICON} />,
			onClick: onCell((e) => e.chain().focus().toggleHeaderRow().run()),
			separatorBefore: true,
		},
		{
			label: 'Toggle header cell',
			icon: <RectangleHorizontal className={ICON} />,
			onClick: onCell((e) => e.chain().focus().toggleHeaderCell().run()),
		},
		{
			label: 'Toggle header column',
			icon: <PanelLeft className={ICON} />,
			onClick: onCell((e) => e.chain().focus().toggleHeaderColumn().run()),
		},

		{
			label: 'Remove table',
			icon: <Trash2 className={ICON} />,
			onClick: onCell((e) => e.chain().focus().deleteTable().run()),
			separatorBefore: true,
		},
	]
}
