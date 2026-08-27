'use client'

import type { Editor } from '@tiptap/react'
import { useEditorState } from '@tiptap/react'
import { Eraser, PaintRoller, PencilLine } from 'lucide-react'
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { PALETTE } from '@/components/editor/color-picker'
import { type CellTarget, clearCellStyling, locateTable, withCellTarget } from '@/features/editor/table-ops'
import { cn } from '@/lib/utils'

export function TableColorToolbar({ editor }: { editor: Editor | null }) {
	const inTable = useEditorState({
		editor,
		selector: ({ editor: instance }) => !!instance && !instance.isDestroyed && instance.isActive('table'),
	})
	const [palette, setPalette] = useState<'background' | 'border' | null>(null)
	const [place, setPlace] = useState<{ top: number; left: number; centered: boolean } | null>(null)
	useEffect(() => {
		if (!editor || !inTable) {
			setPalette(null)
			setPlace(null)
			return
		}
		let frame = 0
		const measure = () => {
			const table = editor.view.dom.querySelector('.ProseMirror-selectednode table, table')
			const { $from } = editor.state.selection
			let node: HTMLElement | null = null
			try {
				node = editor.view.nodeDOM($from.before($from.depth)) as HTMLElement | null
			} catch {
				node = null
			}
			const tableEl =
				(node && (node.closest('table') as HTMLElement | null)) || (table as HTMLElement | null) || null
			if (!tableEl) {
				setPlace(null)
				return
			}
			const rect = tableEl.getBoundingClientRect()
			const selectionMenu = document.querySelector('.selection-menu')
			if (selectionMenu) {
				const menu = selectionMenu.getBoundingClientRect()
				setPlace({ top: menu.top, left: menu.right + 8, centered: false })
				return
			}

			const above = rect.top - 44
			setPlace({
				top: above < 8 ? rect.bottom + 6 : above,
				left: rect.left + rect.width / 2,
				centered: true,
			})
		}
		const update = () => {
			cancelAnimationFrame(frame)
			frame = requestAnimationFrame(measure)
		}
		update()
		editor.on('transaction', update)
		window.addEventListener('scroll', update, true)
		window.addEventListener('resize', update)
		return () => {
			cancelAnimationFrame(frame)
			editor.off('transaction', update)
			window.removeEventListener('scroll', update, true)
			window.removeEventListener('resize', update)
		}
	}, [editor, inTable])
	useEffect(() => {
		if (!inTable) setPalette(null)
	}, [inTable])
	useEffect(() => {
		if (!palette) return
		const onPointer = (e: PointerEvent) => {
			const target = e.target as HTMLElement | null
			if (!target?.closest('.table-color-toolbar') && !target?.closest('.table-color-palette')) {
				setPalette(null)
			}
		}
		document.addEventListener('pointerdown', onPointer)
		return () => document.removeEventListener('pointerdown', onPointer)
	}, [palette])

	if (!editor || !inTable || !place) return null
	const loc = locateTable(editor)
	const target: CellTarget | null = loc
		? { tablePos: loc.tablePos, rowIndex: loc.rowIndex, colIndex: loc.colIndex }
		: null

	const apply = (attr: 'backgroundColor' | 'borderColor', color: string) => {
		if (!target) return
		withCellTarget(editor, target, (e) => {
			e.chain().focus().setCellAttribute(attr, color).run()
		})
		setPalette(null)
	}
	const clear = () => {
		clearCellStyling(editor)
		setPalette(null)
	}

	return createPortal(
		<div
			className="table-color-toolbar fixed z-40 flex items-center gap-0.5"
			style={{
				top: place.top,
				left: place.left,
				transform: place.centered ? 'translateX(-50%)' : undefined,
			}}
		>
			<div className="flex items-center gap-0.5 rounded-full border border-line-strong bg-surface-raised p-1 shadow-[var(--menu-shadow)]">
				<ToolbarBtn
					active={palette === 'background'}
					onClick={() => setPalette(palette === 'background' ? null : 'background')}
					label="Warna latar sel"
				>
					<PaintRoller className="h-4 w-4" />
				</ToolbarBtn>
				<ToolbarBtn
					active={palette === 'border'}
					onClick={() => setPalette(palette === 'border' ? null : 'border')}
					label="Warna bingkai sel"
				>
					<PencilLine className="h-4 w-4" />
				</ToolbarBtn>
			</div>

			{palette && (
				<Palette
					mode={palette}
					onPick={(color) => apply(palette === 'background' ? 'backgroundColor' : 'borderColor', color)}
					onClear={clear}
				/>
			)}
		</div>,
		document.body,
	)
}

function ToolbarBtn({
	active,
	onClick,
	label,
	children,
}: {
	active: boolean
	onClick: () => void
	label: string
	children: React.ReactNode
}) {
	return (
		<button
			type="button"
			title={label}
			aria-label={label}
			aria-pressed={active}
			onClick={onClick}
			onMouseDown={(e) => e.preventDefault()}
			className={cn(
				'flex h-7 w-7 items-center justify-center rounded-full transition-colors',
				active
					? 'bg-accent/15 text-accent'
					: 'text-muted hover:bg-[var(--overlay-hover)] hover:text-foreground',
			)}
		>
			{children}
		</button>
	)
}

function Palette({
	mode,
	onPick,
	onClear,
}: {
	mode: 'background' | 'border'
	onPick: (color: string) => void
	onClear: () => void
}) {
	return (
		<div
			className="table-color-palette ml-1 rounded-xl border border-line-strong bg-surface-raised p-2 shadow-[var(--menu-shadow)]"
			onMouseDown={(e) => e.preventDefault()}
		>
			<div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-faint">
				{mode === 'background' ? 'Warna latar' : 'Warna bingkai'}
			</div>
			<div className="grid grid-cols-8 gap-1">
				{PALETTE.flat().map((color) => (
					<button
						key={color}
						type="button"
						aria-label={color}
						title={color}
						onClick={() => onPick(color)}
						className="h-5 w-5 rounded-md border border-line transition-transform hover:scale-110"
						style={{ background: color }}
					/>
				))}
			</div>
			<button
				type="button"
				onClick={onClear}
				title="Latar, bingkai, dan status sel kepala dilepas sekaligus"
				className="mt-2 flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs text-muted transition-colors hover:bg-[var(--overlay-hover)] hover:text-foreground"
			>
				<Eraser className="h-3.5 w-3.5" />
				Tanpa warna (polos)
			</button>
		</div>
	)
}
