'use client'

import type { Editor } from '@tiptap/react'
import { Table as TableIcon } from 'lucide-react'
import { type KeyboardEvent, useRef, useState } from 'react'
import { Dropdown } from '@/components/ui/dropdown'
import { NO_FORM_RESTORE } from '@/lib/no-form-restore'
import { cn } from '@/lib/utils'

const GRID_COLS = 10
const GRID_ROWS = 8

export function insertTableOfSize(editor: Editor, rows: number, cols: number): boolean {
	return editor.chain().focus().insertTable({ rows, cols, withHeaderRow: true }).run()
}

/**
 * Kisi pemilih ukuran tabel ala Word/Docs: arahkan ke sel untuk memilih
 * kolom × baris, klik atau Enter untuk menyisip. Dulu semua jalur sisip
 * selalu 3×3 (uji editor 2 Okt, TBL-17).
 *
 * Sel memakai roving tabindex: hanya sel yang sedang disorot ada di urutan
 * Tab, panah memindahkan sorotan, jadi kisi 80 sel tetap satu perhentian Tab.
 */
export function TableSizeGrid({ onPick }: { onPick: (rows: number, cols: number) => void }) {
	const [size, setSize] = useState({ rows: 1, cols: 1 })
	const gridRef = useRef<HTMLFieldSetElement>(null)

	const focusCell = (rows: number, cols: number) => {
		setSize({ rows, cols })
		gridRef.current?.querySelector<HTMLButtonElement>(`[data-rows="${rows}"][data-cols="${cols}"]`)?.focus()
	}

	const onKeyDown = (event: KeyboardEvent) => {
		const step: Record<string, [number, number]> = {
			ArrowRight: [0, 1],
			ArrowLeft: [0, -1],
			ArrowDown: [1, 0],
			ArrowUp: [-1, 0],
		}
		const delta = step[event.key]
		if (!delta) return
		event.preventDefault()
		event.stopPropagation()
		const rows = Math.min(GRID_ROWS, Math.max(1, size.rows + delta[0]))
		const cols = Math.min(GRID_COLS, Math.max(1, size.cols + delta[1]))
		focusCell(rows, cols)
	}

	return (
		<div className="px-3 py-2">
			<fieldset
				ref={gridRef}
				aria-label="Table size"
				onKeyDown={onKeyDown}
				className="m-0 grid min-w-0 gap-[3px] border-0 p-0"
				style={{ gridTemplateColumns: `repeat(${GRID_COLS}, 1rem)` }}
			>
				{Array.from({ length: GRID_ROWS * GRID_COLS }, (_, index) => {
					const rows = Math.floor(index / GRID_COLS) + 1
					const cols = (index % GRID_COLS) + 1
					const inside = rows <= size.rows && cols <= size.cols
					const current = rows === size.rows && cols === size.cols
					return (
						<button
							key={`${rows}x${cols}`}
							type="button"
							data-rows={rows}
							data-cols={cols}
							tabIndex={current ? 0 : -1}
							aria-label={`${cols} × ${rows} table`}
							onMouseEnter={() => setSize({ rows, cols })}
							onFocus={() => setSize({ rows, cols })}
							onClick={() => onPick(rows, cols)}
							className={cn(
								'h-4 w-4 rounded-[3px] border transition-colors',
								inside ? 'border-accent bg-accent/25' : 'border-line-strong bg-surface-inset',
							)}
						/>
					)
				})}
			</fieldset>
			<p className="mt-2 text-center text-xs tabular-nums text-muted" aria-live="polite">
				{size.cols} × {size.rows}
			</p>
		</div>
	)
}

/** Tombol Tabel di toolbar: membuka kisi pemilih ukuran. */
export function TableSizeButton({ editor, disabled }: { editor: Editor | null; disabled?: boolean }) {
	return (
		<Dropdown
			menuClassName="min-w-0"
			trigger={({ open, toggle, id }) => (
				<button
					type="button"
					onClick={toggle}
					disabled={disabled}
					{...NO_FORM_RESTORE}
					aria-label="Table"
					title="Table"
					aria-haspopup="menu"
					aria-expanded={open}
					aria-controls={id}
					className={cn(
						'flex h-7 w-7 items-center justify-center rounded-md text-muted transition-colors',
						open ? 'bg-[var(--overlay-active)]' : 'hover:bg-[var(--overlay-hover)] hover:text-foreground',
						disabled && 'cursor-not-allowed opacity-40',
					)}
				>
					<TableIcon className="h-4 w-4" />
				</button>
			)}
		>
			{({ close }) => (
				<TableSizeGrid
					onPick={(rows, cols) => {
						close()
						if (editor) insertTableOfSize(editor, rows, cols)
					}}
				/>
			)}
		</Dropdown>
	)
}
