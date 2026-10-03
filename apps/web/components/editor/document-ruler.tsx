'use client'

import type { Editor } from '@tiptap/react'
import { useCallback, useRef, useState } from 'react'
import { type ColumnDrag, dragColumns, layoutPatch } from '@/features/editor/column-geometry'
import { type BlockIndent, clampBlockIndent, useBlockIndent } from '@/features/editor/indent'
import { MIN_CONTENT_WIDTH, type PageGeometry, type PageMargins } from '@/features/editor/page-geometry'
import { clamp, rulerNudge, snapFrom, useRulerDrag } from '@/features/editor/ruler-drag'
import {
	addTabStop,
	cycleTabStop,
	moveTabStop,
	PX_PER_PT,
	removeTabStop,
	updateTabStops,
} from '@/features/editor/ruler-tabs'
import {
	type ColumnsRulerTarget,
	type TableRulerTarget,
	useRulerTarget,
	useTabStops,
} from '@/features/editor/ruler-targets'
import { type RulerUnit, rulerTicks } from '@/features/editor/ruler-ticks'
import type { TabStop, TabStopType } from '@/features/editor/tab-stops'
import {
	MIN_COLUMN_WIDTH,
	scaleColumnWidths,
	setColumnWidths,
	setTableIndent,
} from '@/features/editor/table-ops'
import { useSettings } from '@/features/settings/settings-context'
import { cn } from '@/lib/utils'

type Handle =
	| { kind: 'marginLeft' }
	| { kind: 'marginRight' }
	| { kind: 'firstLine' }
	| { kind: 'indentLeft' }
	| { kind: 'indentRight' }
	| { kind: 'tableLeft' }
	| { kind: 'tableRight' }
	| { kind: 'tableCol'; index: number }
	| { kind: 'imageX' }
	| { kind: 'columnsGap'; index: number; side: 'left' | 'right' }
	| { kind: 'columnsGapBand'; index: number }
	/* Tab stop paragraf (TKS-18): `at` posisinya kini dalam pt, null = tab stop
	 * baru yang sedang ditaruh; `start` posisi awal seret di penggaris. */
	| { kind: 'tab'; at: number | null; start: number }

/*
 * Gagang yang naskahnya baru mengalir saat jari diangkat.
 *
 * Margin ikut di sini karena ia yang paling mahal: satu tulis `pointermove`
 * berarti paginasi menghitung ulang SELURUH dokumen, enam puluh kali sedetik -
 * di naskah empat puluh halaman itulah jank-nya, bukan di penggaris yang
 * digambar ulang. Yang bergerak selama seret cuma arsiran dan gagangnya.
 */
const DEFERRED: ReadonlySet<Handle['kind']> = new Set([
	'marginLeft',
	'marginRight',
	'tableLeft',
	'tableRight',
	'tableCol',
	'imageX',
	'columnsGap',
	'columnsGapBand',
	'tab',
])

/**
 * Margin hasil menyeret gagang, atau `null` kalau gagangnya bukan margin.
 *
 * Diangkat ke tingkat modul karena dua pemakainya harus sepakat mutlak:
 * arsiran yang bergerak selama seret, dan nilai yang benar-benar tertulis saat
 * dilepas. Dua salinan clamp yang menyimpang berarti penggarisnya menjanjikan
 * margin yang tidak akan pernah tersimpan.
 */
export function rulerMarginPatch(
	kind: Handle['kind'],
	x: number,
	width: number,
	margins: PageMargins,
): Partial<PageMargins> | null {
	if (kind === 'marginLeft') {
		return { left: clamp(x, 0, width - margins.right - MIN_CONTENT_WIDTH) }
	}
	if (kind === 'marginRight') {
		return { right: clamp(width - x, 0, width - margins.left - MIN_CONTENT_WIDTH) }
	}
	return null
}

const RULER_HEIGHT = 24

export function DocumentRuler({
	geometry,
	zoom,
	editor,
	onMarginsChange,
	className,
}: {
	geometry: PageGeometry
	zoom: number
	editor: Editor | null
	onMarginsChange: (patch: Partial<PageMargins>) => void
	className?: string
}) {
	const { width, margins, contentWidth } = geometry
	const { settings } = useSettings()
	const indent = useBlockIndent(editor)
	const target = useRulerTarget(editor)
	const tabStops = useTabStops(editor)
	const trackRef = useRef<HTMLDivElement>(null)
	const [preview, setPreview] = useState<number | null>(null)
	const previewRef = useRef<number | null>(null)
	/* Tab stop yang sedang diseret menjauhi penggaris - dibuang saat dilepas. */
	const [detached, setDetached] = useState(false)
	const activeColumn = target?.kind === 'columns' ? target.active : undefined
	const indentBase = margins.left + (activeColumn?.left ?? 0)
	const indentWidth = activeColumn?.width ?? contentWidth

	const setIndent = useCallback(
		(patch: Partial<BlockIndent>) => {
			if (!editor) return
			const next = clampBlockIndent({ ...indent, ...patch }, indentWidth)
			editor.commands.setBlockIndent(next)
		},
		[editor, indent, indentWidth],
	)
	const marginPatch = useCallback(
		(handle: Handle, x: number) => rulerMarginPatch(handle.kind, x, width, margins),
		[width, margins],
	)
	/* Tab stop diterapkan ke tiap paragraf yang disentuh seleksi, seperti Word. */
	const changeTabStops = useCallback(
		(change: (stops: TabStop[]) => TabStop[]) => {
			if (editor) updateTabStops(editor.state, editor.view.dispatch, change)
		},
		[editor],
	)
	const applyHandle = useCallback(
		(handle: Handle, x: number) => {
			const patch = marginPatch(handle, x)
			if (patch) {
				onMarginsChange(patch)
				return
			}
			switch (handle.kind) {
				case 'firstLine':
					setIndent({ firstLine: x - indentBase - indent.left })
					return
				case 'indentLeft':
					setIndent({ left: x - indentBase })
					return
				case 'indentRight':
					setIndent({ right: indentBase + indentWidth - x })
					return
				case 'columnsGap':
				case 'columnsGapBand': {
					if (!editor || target?.kind !== 'columns') return
					applyColumnsHandle(editor, handle, x, target, margins.left)
					return
				}
				case 'tab': {
					/* Dalam pt dari tepi kiri area teks - margin kiri, atau tepi kolom. */
					const posPt = clamp(x - indentBase, 0, indentWidth) / PX_PER_PT
					const { at } = handle
					changeTabStops((stops) => (at === null ? addTabStop(stops, posPt) : moveTabStop(stops, at, posPt)))
					return
				}
				case 'imageX': {
					if (!editor || target?.kind !== 'image') return
					const room = Math.max(0, contentWidth - target.width)
					editor.commands.setImageOffsetX(clamp(x - margins.left, 0, room))
					return
				}
				case 'tableLeft':
				case 'tableRight':
				case 'tableCol': {
					if (!editor || target?.kind !== 'table') return
					applyTableHandle(editor, handle, x, target, {
						contentLeft: margins.left,
						contentRight: width - margins.right,
					})
					return
				}
			}
		},
		[
			width,
			margins.left,
			margins.right,
			indent.left,
			indentBase,
			indentWidth,
			contentWidth,
			editor,
			target,
			onMarginsChange,
			setIndent,
			marginPatch,
			changeTabStops,
		],
	)
	const { dragging, startDrag } = useRulerDrag<Handle>({
		axis: 'x',
		zoom,
		trackRef,
		snapOrigin: (handle) => (handle.kind === 'tab' ? indentBase : 0),
		onMove: (handle, x, outside) => {
			if (DEFERRED.has(handle.kind)) {
				previewRef.current = x
				setPreview(x)
				if (handle.kind === 'tab') setDetached(outside)
			} else {
				applyHandle(handle, x)
			}
		},
		onUp: (handle, x, outside) => {
			if (handle.kind === 'tab') {
				/* Diseret keluar penggaris: dibuang (yang baru tidak jadi ditaruh).
				 * Tab stop baru yang dilepas tanpa bergeser tetap di titik klik. */
				const { at } = handle
				if (outside) {
					if (at !== null) changeTabStops((stops) => removeTabStop(stops, at))
				} else {
					const final = x ?? (at === null ? handle.start : null)
					if (final !== null) applyHandle(handle, final)
				}
			} else if (DEFERRED.has(handle.kind) && x !== null) {
				applyHandle(handle, x)
			}
			previewRef.current = null
			setPreview(null)
			setDetached(false)
		},
	})

	const nudge = (handle: Handle, current: number) => rulerNudge('x', handle, current, applyHandle)

	const toScreen = (x: number) => x * zoom

	const firstLineX = indentBase + indent.left + indent.firstLine
	const indentLeftX = indentBase + indent.left
	const indentRightX = indentBase + indentWidth - indent.right
	const hasIndentControls = editor !== null && target?.kind !== 'table'
	const live = (x: number, match: (handle: Handle) => boolean) =>
		preview !== null && dragging !== null && match(dragging) ? preview : x

	/*
	 * Menekan bagian kosong penggaris di dalam area teks menaruh tab stop kiri
	 * (TKS-18), seperti Word. Ia langsung bisa diseret sebelum dilepas, dan
	 * baru tertulis saat dilepas - satu langkah urung per gerakan.
	 */
	const placeTab = (event: React.PointerEvent<HTMLDivElement>) => {
		if (!hasIndentControls || event.button !== 0) return
		if (event.target instanceof Element && event.target.closest('button')) return
		const rect = trackRef.current?.getBoundingClientRect()
		if (!rect) return
		const x = snapFrom(indentBase, (event.clientX - rect.left) / zoom, event.shiftKey)
		if (x < indentBase || x > indentBase + indentWidth) return
		previewRef.current = x
		setPreview(x)
		startDrag({ kind: 'tab', at: null, start: x })(event)
	}
	const tabKeys = (stop: TabStop, x: number) => (event: React.KeyboardEvent) => {
		if (event.key === 'Delete' || event.key === 'Backspace') {
			event.preventDefault()
			changeTabStops((stops) => removeTabStop(stops, stop.posPt))
			return
		}
		nudge({ kind: 'tab', at: stop.posPt, start: x }, x)(event)
	}
	const tabMarkers = hasIndentControls
		? tabStops.map((stop) => ({ stop, x: indentBase + stop.posPt * PX_PER_PT })).filter(({ x }) => x <= width)
		: []
	const placing = dragging?.kind === 'tab' && dragging.at === null && preview !== null ? preview : null

	/*
	 * Margin yang SEDANG ditampilkan. Selama seret ia ikut jari, sementara naskah
	 * di bawahnya belum mengalir - itu memang perilakunya: yang ditunda hanya
	 * alirannya, bukan umpan baliknya. Penanda indentasi sengaja tidak ikut
	 * bergerak; ia milik teks, dan teks belum pindah.
	 */
	const shownMargins: PageMargins =
		dragging !== null && preview !== null
			? { ...margins, ...(marginPatch(dragging, preview) ?? {}) }
			: margins

	const table =
		target?.kind === 'table'
			? (() => {
					const left = margins.left + target.indentLeft
					const edges: number[] = [left]
					for (const columnWidth of target.widths) edges.push(edges[edges.length - 1] + columnWidth)
					return { left, edges, right: edges[edges.length - 1] }
				})()
			: null
	const columns =
		target?.kind === 'columns'
			? (() => {
					const gaps: { left: number; right: number; index: number }[] = []
					let left = margins.left
					for (let index = 0; index < target.widths.length - 1; index++) {
						const gapLeft = left + target.widths[index]
						const size = target.gaps[index] ?? 0
						gaps.push({ left: gapLeft, right: gapLeft + size, index })
						left = gapLeft + size
					}
					return { gaps }
				})()
			: null

	const image =
		target?.kind === 'image'
			? {
					x:
						target.offsetX !== null
							? margins.left + target.offsetX
							: target.align === 'center'
								? margins.left + Math.max(0, (contentWidth - target.width) / 2)
								: target.align === 'right'
									? width - margins.right - target.width
									: margins.left,
				}
			: null

	return (
		<div
			className={cn('document-ruler', dragging && 'document-ruler--dragging', className)}
			style={{ width: toScreen(width), height: RULER_HEIGHT }}
			aria-label="Page ruler"
		>
			<div ref={trackRef} className="relative h-full" onPointerDown={placeTab}>
				{/* Arsiran margin: area di luar batas tulis. */}
				<div className="document-ruler__margin" style={{ left: 0, width: toScreen(shownMargins.left) }} />
				<div
					className="document-ruler__margin"
					style={{
						left: toScreen(width - shownMargins.right),
						width: toScreen(shownMargins.right),
					}}
				/>

				<Ticks width={width} zoom={zoom} unit={settings.measurementUnit} />

				<MarginHandle
					label="Left margin"
					x={toScreen(shownMargins.left)}
					onPointerDown={startDrag({ kind: 'marginLeft' })}
					onKeyDown={nudge({ kind: 'marginLeft' }, margins.left)}
				/>
				<MarginHandle
					label="Right margin"
					x={toScreen(width - shownMargins.right)}
					onPointerDown={startDrag({ kind: 'marginRight' })}
					onKeyDown={nudge({ kind: 'marginRight' }, width - margins.right)}
				/>

				{hasIndentControls && (
					<>
						<IndentHandle
							variant="first-line"
							label="First line indent"
							x={toScreen(firstLineX)}
							onPointerDown={startDrag({ kind: 'firstLine' })}
							onKeyDown={nudge({ kind: 'firstLine' }, firstLineX)}
						/>
						<IndentHandle
							variant="left"
							label="Left indent"
							x={toScreen(indentLeftX)}
							onPointerDown={startDrag({ kind: 'indentLeft' })}
							onKeyDown={nudge({ kind: 'indentLeft' }, indentLeftX)}
						/>
						<IndentHandle
							variant="right"
							label="Right indent"
							x={toScreen(indentRightX)}
							onPointerDown={startDrag({ kind: 'indentRight' })}
							onKeyDown={nudge({ kind: 'indentRight' }, indentRightX)}
						/>
					</>
				)}

				{tabMarkers.map(({ stop, x }, index) => {
					const moving = dragging?.kind === 'tab' && dragging.at === stop.posPt
					return (
						<TabMarker
							// biome-ignore lint/suspicious/noArrayIndexKey: identitas tab stop = urutannya; posisinya berubah saat digeser papan tik, dan fokus harus tetap di penandanya
							key={`tab-${index}`}
							type={stop.type}
							x={toScreen(moving && preview !== null ? preview : x)}
							detached={moving && detached}
							onPointerDown={startDrag({ kind: 'tab', at: stop.posPt, start: x })}
							onKeyDown={tabKeys(stop, x)}
							onDoubleClick={() => changeTabStops((stops) => cycleTabStop(stops, stop.posPt))}
						/>
					)
				})}
				{placing !== null && (
					<span
						aria-hidden="true"
						className={cn(
							'document-ruler__tab document-ruler__tab--left',
							detached && 'document-ruler__tab--detached',
						)}
						style={{ left: toScreen(placing) }}
					/>
				)}

				{table && (
					<>
						<ObjectHandle
							variant="table-edge"
							label="Table left edge"
							x={toScreen(live(table.left, (handle) => handle.kind === 'tableLeft'))}
							onPointerDown={startDrag({ kind: 'tableLeft' })}
							onKeyDown={nudge({ kind: 'tableLeft' }, table.left)}
						/>
						<ObjectHandle
							variant="table-edge"
							label="Table right edge"
							x={toScreen(live(table.right, (handle) => handle.kind === 'tableRight'))}
							onPointerDown={startDrag({ kind: 'tableRight' })}
							onKeyDown={nudge({ kind: 'tableRight' }, table.right)}
						/>
						{/* Hanya batas ANTAR kolom; kedua ujungnya sudah jadi marker tepi. */}
						{table.edges.slice(1, -1).map((edge, index) => (
							<ObjectHandle
								key={`col-${index}-${table.edges.length}`}
								variant="table-column"
								label={`Border between columns ${index + 1} and ${index + 2}`}
								x={toScreen(live(edge, (handle) => handle.kind === 'tableCol' && handle.index === index))}
								onPointerDown={startDrag({ kind: 'tableCol', index })}
								onKeyDown={nudge({ kind: 'tableCol', index }, edge)}
							/>
						))}
					</>
				)}

				{columns && (
					<>
						{columns.gaps.map((gap) => (
							<GapMarker
								key={`gap-${gap.index}-${columns.gaps.length}`}
								label={`Gap between columns ${gap.index + 1} and ${gap.index + 2}`}
								left={toScreen(
									live(gap.left, (handle) => handle.kind === 'columnsGapBand' && handle.index === gap.index),
								)}
								width={toScreen(gap.right - gap.left)}
								onPointerDown={startDrag({ kind: 'columnsGapBand', index: gap.index })}
								onKeyDown={nudge({ kind: 'columnsGapBand', index: gap.index }, gap.left)}
								onDoubleClick={() => {
									if (target?.kind === 'columns') {
										editor?.commands.setColumnsLayout(target.pos, { widths: null, gaps: null })
									}
								}}
							/>
						))}
						{columns.gaps.map((gap) => (
							<ObjectHandle
								key={`gap-left-${gap.index}`}
								variant="columns-gap"
								label={`Column ${gap.index + 1} width and gap`}
								x={toScreen(
									live(
										gap.left,
										(handle) =>
											handle.kind === 'columnsGap' && handle.index === gap.index && handle.side === 'left',
									),
								)}
								onPointerDown={startDrag({ kind: 'columnsGap', index: gap.index, side: 'left' })}
								onKeyDown={nudge({ kind: 'columnsGap', index: gap.index, side: 'left' }, gap.left)}
							/>
						))}
						{columns.gaps.map((gap) => (
							<ObjectHandle
								key={`gap-right-${gap.index}`}
								variant="columns-gap"
								label={`Gap and column ${gap.index + 2} width`}
								x={toScreen(
									live(
										gap.right,
										(handle) =>
											handle.kind === 'columnsGap' && handle.index === gap.index && handle.side === 'right',
									),
								)}
								onPointerDown={startDrag({ kind: 'columnsGap', index: gap.index, side: 'right' })}
								onKeyDown={nudge({ kind: 'columnsGap', index: gap.index, side: 'right' }, gap.right)}
							/>
						))}
					</>
				)}

				{image && (
					<>
						<ObjectHandle
							variant="image"
							label="Image position"
							x={toScreen(live(image.x, (handle) => handle.kind === 'imageX'))}
							onPointerDown={startDrag({ kind: 'imageX' })}
							onKeyDown={nudge({ kind: 'imageX' }, image.x)}
						/>
						{/* Perataan diklik, tidak diseret - tiga posisi yang sudah pasti
						    tidak perlu ditemukan lewat gerakan tangan. */}
						{ALIGNMENTS.map((option) => (
							<AlignPip
								key={option.value}
								label={option.label}
								active={target?.kind === 'image' && target.offsetX === null && target.align === option.value}
								x={toScreen(
									option.value === 'left'
										? margins.left
										: option.value === 'center'
											? margins.left + contentWidth / 2
											: width - margins.right,
								)}
								onSelect={() => editor?.commands.setImageAlign(option.value)}
							/>
						))}
					</>
				)}
			</div>
		</div>
	)
}

const ALIGNMENTS = [
	{ value: 'left' as const, label: 'Align image left' },
	{ value: 'center' as const, label: 'Align image center' },
	{ value: 'right' as const, label: 'Align image right' },
]

function applyTableHandle(
	editor: Editor,
	handle: Extract<Handle, { kind: 'tableLeft' | 'tableRight' | 'tableCol' }>,
	x: number,
	target: TableRulerTarget,
	bounds: { contentLeft: number; contentRight: number },
): void {
	const { widths, tablePos } = target
	const floor = MIN_COLUMN_WIDTH * widths.length
	const left = bounds.contentLeft + target.indentLeft
	const right = left + widths.reduce((sum, value) => sum + value, 0)

	if (handle.kind === 'tableLeft') {
		const nextLeft = clamp(x, bounds.contentLeft, Math.max(bounds.contentLeft, right - floor))
		setTableIndent(editor, tablePos, nextLeft - bounds.contentLeft)
		setColumnWidths(editor, tablePos, scaleColumnWidths(widths, right - nextLeft))
		return
	}

	if (handle.kind === 'tableRight') {
		const nextRight = clamp(x, left + floor, bounds.contentRight)
		setColumnWidths(editor, tablePos, scaleColumnWidths(widths, nextRight - left))
		return
	}

	const index = handle.index
	if (index < 0 || index >= widths.length - 1) return
	const before = left + widths.slice(0, index).reduce((sum, value) => sum + value, 0)
	const pair = widths[index] + widths[index + 1]
	const first = clamp(x - before, MIN_COLUMN_WIDTH, pair - MIN_COLUMN_WIDTH)
	const next = [...widths]
	next[index] = Math.round(first)
	next[index + 1] = pair - next[index]
	setColumnWidths(editor, tablePos, next)
}

function applyColumnsHandle(
	editor: Editor,
	handle: Extract<Handle, { kind: 'columnsGap' | 'columnsGapBand' }>,
	x: number,
	target: ColumnsRulerTarget,
	contentLeft: number,
): void {
	const drag: ColumnDrag =
		handle.kind === 'columnsGapBand'
			? { kind: 'band', index: handle.index }
			: { kind: 'edge', index: handle.index, side: handle.side }
	const next = dragColumns({ widths: target.widths, gaps: target.gaps }, drag, x - contentLeft)
	editor.commands.setColumnsLayout(target.pos, layoutPatch(next))
}

/* Satuan mengikuti pengaturan pengguna, sama dengan penggaris kiri (KOL-13). */
function Ticks({ width, zoom, unit }: { width: number; zoom: number; unit: RulerUnit }) {
	return (
		<>
			{rulerTicks(width, unit, zoom).map((tick) =>
				tick.kind === 'label' ? (
					<span key={tick.at} className="document-ruler__label" style={{ left: tick.at * zoom }}>
						{tick.value}
					</span>
				) : (
					<span
						key={tick.at}
						className={cn('document-ruler__tick', tick.kind === 'major' && 'document-ruler__tick--major')}
						style={{ left: tick.at * zoom }}
					/>
				),
			)}
		</>
	)
}

function MarginHandle({
	label,
	x,
	onPointerDown,
	onKeyDown,
}: {
	label: string
	x: number
	onPointerDown: (event: React.PointerEvent) => void
	onKeyDown: (event: React.KeyboardEvent) => void
}) {
	return (
		<button
			type="button"
			aria-label={label}
			title={label}
			className="document-ruler__margin-handle"
			style={{ left: x }}
			onPointerDown={onPointerDown}
			onKeyDown={onKeyDown}
		/>
	)
}

function ObjectHandle({
	variant,
	label,
	x,
	onPointerDown,
	onKeyDown,
}: {
	variant: 'table-edge' | 'table-column' | 'image' | 'columns-gap'
	label: string
	x: number
	onPointerDown: (event: React.PointerEvent) => void
	onKeyDown: (event: React.KeyboardEvent) => void
}) {
	return (
		<button
			type="button"
			aria-label={label}
			title={label}
			className={cn('document-ruler__object', `document-ruler__object--${variant}`)}
			style={{ left: x }}
			onPointerDown={onPointerDown}
			onKeyDown={onKeyDown}
		/>
	)
}

function GapMarker({
	label,
	left,
	width,
	onPointerDown,
	onKeyDown,
	onDoubleClick,
}: {
	label: string
	left: number
	width: number
	onPointerDown: (event: React.PointerEvent) => void
	onKeyDown: (event: React.KeyboardEvent) => void
	onDoubleClick: () => void
}) {
	return (
		<button
			type="button"
			aria-label={label}
			title={`${label} - double-click to make the columns equal`}
			className="document-ruler__gap-band"
			style={{ left, width }}
			onPointerDown={onPointerDown}
			onKeyDown={onKeyDown}
			onDoubleClick={onDoubleClick}
		/>
	)
}

function AlignPip({
	label,
	x,
	active,
	onSelect,
}: {
	label: string
	x: number
	active: boolean
	onSelect: () => void
}) {
	return (
		<button
			type="button"
			aria-label={label}
			title={label}
			aria-pressed={active}
			className={cn('document-ruler__align', active && 'document-ruler__align--active')}
			style={{ left: x }}
			onPointerDown={(event) => event.preventDefault()}
			onClick={onSelect}
		/>
	)
}

const TAB_LABELS: Record<TabStopType, string> = {
	left: 'Left tab stop',
	center: 'Center tab stop',
	right: 'Right tab stop',
}

/* Siku kecil seperti Word: L kiri, ⊥ tengah, ⅃ kanan. */
function TabMarker({
	type,
	x,
	detached,
	onPointerDown,
	onKeyDown,
	onDoubleClick,
}: {
	type: TabStopType
	x: number
	detached: boolean
	onPointerDown: (event: React.PointerEvent) => void
	onKeyDown: (event: React.KeyboardEvent) => void
	onDoubleClick: () => void
}) {
	const label = TAB_LABELS[type]
	return (
		<button
			type="button"
			aria-label={label}
			title={`${label} - drag to move, drag off the ruler to remove, double-click to change type`}
			className={cn(
				'document-ruler__tab',
				`document-ruler__tab--${type}`,
				detached && 'document-ruler__tab--detached',
			)}
			style={{ left: x }}
			onPointerDown={onPointerDown}
			onKeyDown={onKeyDown}
			onDoubleClick={onDoubleClick}
		/>
	)
}

function IndentHandle({
	variant,
	label,
	x,
	onPointerDown,
	onKeyDown,
}: {
	variant: 'first-line' | 'left' | 'right'
	label: string
	x: number
	onPointerDown: (event: React.PointerEvent) => void
	onKeyDown: (event: React.KeyboardEvent) => void
}) {
	return (
		<button
			type="button"
			aria-label={label}
			title={label}
			className={cn('document-ruler__indent', `document-ruler__indent--${variant}`)}
			style={{ left: x }}
			onPointerDown={onPointerDown}
			onKeyDown={onKeyDown}
		/>
	)
}
