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
	ArrowLeftToLine,
	BetweenHorizontalEnd,
	BetweenHorizontalStart,
	BetweenVerticalEnd,
	BetweenVerticalStart,
	Eraser,
	PanelLeft,
	PanelTop,
	PaintRoller,
	PencilLine,
	RectangleHorizontal,
	TableCellsMerge,
	TableCellsSplit,
	Trash2,
} from 'lucide-react'
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type JSX } from 'react'
import { createPortal } from 'react-dom'
import { PALETTE } from '@/components/editor/color-picker'
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

/**
 * Menu konteks tabel (grip baris, tombol ••• kolom, atau klik kanan).
 *
 * Menu dijangkarkan ke elemen pemicunya: posisinya dihitung ulang tiap kali
 * halaman digulir atau jendela berubah ukuran, jadi menu ikut bergerak bersama
 * tabel alih-alih diam menempel di layar. Menu juga membalik ke atas/kiri bila
 * ruang di bawah/kanan tak cukup, dan menutup diri bila jangkarnya lenyap dari
 * DOM (mis. barisnya terhapus).
 */
export interface TableMenuState {
	/** Dari mana menu dibuka - dipakai pemanggil untuk menentukan apa yang ikut
	 *  terpilih; isi menunya sendiri sama untuk ketiganya. */
	origin: MenuOrigin
	tablePos: number
	rowIndex: number
	colIndex: number
	rowCount: number
	colCount: number
	anchor: HTMLElement
	/** Geseran titik buka terhadap sudut kiri-atas jangkar. Dipakai klik kanan
	 *  supaya menu muncul di penunjuk, tapi tetap ikut bergerak bersama selnya. */
	offset?: { x: number; y: number }
}

interface MenuRow {
	label: string
	icon: JSX.Element
	onClick: () => void
	disabled?: boolean
	separatorBefore?: boolean
}

/** Jarak menu dari jangkar & dari tepi layar. */
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
	// Mode palet warna: 'none' = daftar item biasa, 'background'/'border' =
	// tampilan palet warna sel/bingkai.
	const [paletteMode, setPaletteMode] = useState<'none' | 'background' | 'border'>('none')

	const items = buildItems(editor, menu, onClose, (mode) => setPaletteMode(mode))

	useEffect(() => setActive(0), [menu])

	// Tandai handle pemicunya supaya tetap terlihat selama menu terbuka.
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
		// Titik buka: di penunjuk (klik kanan) atau tepat di bawah handle.
		const originTop = offset ? a.top + offset.y : a.bottom + GAP
		const originBottom = offset ? a.top + offset.y : a.top
		let top = originTop
		let left = offset ? a.left + offset.x : a.left
		// Balik ke atas titik buka bila tak muat di bawah.
		if (top + height > window.innerHeight - EDGE) {
			top = originBottom - height - GAP
			if (top < EDGE) top = Math.max(EDGE, window.innerHeight - height - EDGE)
		}
		if (left + width > window.innerWidth - EDGE) left = window.innerWidth - width - EDGE
		setPos({ top: Math.max(EDGE, top), left: Math.max(EDGE, left) })
	}, [anchor, offset, onClose])

	useLayoutEffect(place, [place, items.length])

	// Ikuti gulir/resize. `capture: true` supaya gulir di dalam kanvas dokumen
	// (bukan window) juga tertangkap.
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
			{paletteMode === 'none' ? (
				items.map((item, i) => (
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
				))
			) : (
				<CellPalette
					mode={paletteMode}
					editor={editor}
					menu={menu}
					onBack={() => setPaletteMode('none')}
					onClose={onClose}
				/>
			)}
		</div>,
		document.body,
	)
}

/** Palet warna untuk latar/bingkai sel yang dipilih. */
function CellPalette({
	mode,
	editor,
	menu,
	onBack,
	onClose,
}: {
	mode: 'background' | 'border'
	editor: Editor
	menu: TableMenuState
	onBack: () => void
	onClose: () => void
}) {
	const target: CellTarget = { tablePos: menu.tablePos, rowIndex: menu.rowIndex, colIndex: menu.colIndex }
	// Atribut yang diatur: 'backgroundColor' atau 'borderColor'.
	const attr = mode === 'background' ? 'backgroundColor' : 'borderColor'

	const apply = (color: string | null) => {
		withCellTarget(editor, target, (e) => {
			e.chain().focus().setCellAttribute(attr, color).run()
		})
		onClose()
	}

	return (
		<div className="px-2 py-1">
			<button
				type="button"
				onClick={onBack}
				className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted transition-colors hover:text-foreground"
			>
				<ArrowLeftToLine className="h-3.5 w-3.5" />
				{mode === 'background' ? 'Warna latar sel' : 'Warna bingkai sel'}
			</button>
			<div className="grid grid-cols-8 gap-1">
				{PALETTE.flat().map((color) => (
					<button
						key={color}
						type="button"
						aria-label={color}
						title={color}
						onClick={() => apply(color)}
						className="h-5 w-5 rounded-md border border-line transition-transform hover:scale-110"
						style={{ background: color }}
					/>
				))}
			</div>
			<button
				type="button"
				onClick={() => apply(null)}
				className="mt-2 flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs text-muted transition-colors hover:bg-[var(--overlay-hover)] hover:text-foreground"
			>
				<Eraser className="h-3.5 w-3.5" />
				{mode === 'background' ? 'Hapus warna latar' : 'Hapus warna bingkai'}
			</button>
		</div>
	)
}

const ICON = 'h-4 w-4'

function buildItems(
	editor: Editor,
	menu: TableMenuState,
	onClose: () => void,
	openPalette: (mode: 'background' | 'border') => void,
): MenuRow[] {
	const { rowIndex, colIndex, rowCount, colCount } = menu
	const target: CellTarget = { tablePos: menu.tablePos, rowIndex, colIndex }

	const wrap = (fn: () => void) => () => {
		fn()
		onClose()
	}
	/** Perintah TableKit yang bekerja atas seleksi sel. */
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
			label: 'Cell background color',
			icon: <PaintRoller className={ICON} />,
			// Buka palet warna, bukan tutup menu; palette menutup sendiri.
			onClick: () => openPalette('background'),
			separatorBefore: true,
		},
		{
			label: 'Cell border color',
			icon: <PencilLine className={ICON} />,
			onClick: () => openPalette('border'),
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
