'use client'

import type { Editor } from '@tiptap/react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { type BlockIndent, clampBlockIndent, useBlockIndent } from '@/features/editor/indent'
import {
	INCH,
	MIN_CONTENT_WIDTH,
	type PageGeometry,
	type PageMargins,
} from '@/features/editor/page-geometry'
import { type TableRulerTarget, useRulerTarget } from '@/features/editor/ruler-targets'
import { setColumnWidths, setTableIndent } from '@/features/editor/table-ops'
import { cn } from '@/lib/utils'

/**
 * Penggaris horizontal di atas lembar.
 *
 * Dua besaran berbeda hidup di satu batang yang sama: margin lembar (berlaku
 * untuk seluruh dokumen) dan indentasi paragraf yang sedang dipilih. Batas
 * margin ditandai pergantian arsiran, indentasi ditandai marker segitiga -
 * pembagian yang sama dipakai Word maupun Google Docs, jadi tidak perlu
 * dijelaskan ulang ke pengguna.
 *
 * Semua posisi dihitung dalam piksel dokumen lalu dikalikan zoom saat digambar,
 * sehingga marker tetap seukuran jari berapa pun perbesarannya.
 */

/**
 * Marker paragraf & margin berlaku terus-menerus; marker tabel/gambar hanya
 * muncul saat sasarannya aktif. `tableCol` membawa indeks batas kolom yang
 * diseret (0 = batas antara kolom pertama dan kedua).
 */
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

/** Marker yang menulis ke dokumen hanya saat pointer dilepas. */
const DEFERRED: ReadonlySet<Handle['kind']> = new Set(['tableLeft', 'tableRight', 'tableCol', 'imageX'])

/** Kolom tidak boleh menyempit sampai isinya tak terbaca. */
const MIN_COLUMN_WIDTH = 24

/** Seret menempel ke 1/16 inci; tahan Shift untuk gerak halus per piksel. */
const SNAP = INCH / 16
const NUDGE = SNAP

const RULER_HEIGHT = 24

function clamp(value: number, min: number, max: number): number {
	return Math.max(min, Math.min(value, max))
}

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
	const indent = useBlockIndent(editor)
	const target = useRulerTarget(editor)
	const trackRef = useRef<HTMLDivElement>(null)
	const [dragging, setDragging] = useState<Handle | null>(null)
	// Posisi sementara selama menyeret marker tabel/gambar. Marker itu menulis
	// ke dokumen saat pointer dilepas, bukan tiap gerakan: satu langkah seret
	// pada kolom menulis ke SETIAP sel di kolom itu, dan menulisnya per piksel
	// membanjiri Yjs sekaligus membuat riwayat undo tak terpakai.
	const [preview, setPreview] = useState<number | null>(null)
	const previewRef = useRef<number | null>(null)

	const setIndent = useCallback(
		(patch: Partial<BlockIndent>) => {
			if (!editor) return
			const next = clampBlockIndent({ ...indent, ...patch }, contentWidth)
			editor.commands.setBlockIndent(next)
		},
		[editor, indent, contentWidth],
	)

	/** Terapkan satu posisi (piksel dokumen, diukur dari tepi kiri lembar). */
	const applyHandle = useCallback(
		(handle: Handle, x: number) => {
			switch (handle.kind) {
				case 'marginLeft':
					onMarginsChange({ left: clamp(x, 0, width - margins.right - MIN_CONTENT_WIDTH) })
					return
				case 'marginRight':
					onMarginsChange({
						right: clamp(width - x, 0, width - margins.left - MIN_CONTENT_WIDTH),
					})
					return
				case 'firstLine':
					setIndent({ firstLine: x - margins.left - indent.left })
					return
				case 'indentLeft':
					setIndent({ left: x - margins.left })
					return
				case 'indentRight':
					setIndent({ right: width - margins.right - x })
					return
				case 'imageX': {
					if (!editor || target?.kind !== 'image') return
					// Ditahan supaya gambar tidak bisa didorong keluar area konten.
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
		[width, margins.left, margins.right, indent.left, contentWidth, editor, target, onMarginsChange, setIndent],
	)

	// Pointer dilepas di mana saja, bahkan di luar jendela, jadi listener-nya
	// menempel di window selama seretan berlangsung.
	useEffect(() => {
		if (!dragging) return

		const positionOf = (event: PointerEvent) => {
			const rect = trackRef.current?.getBoundingClientRect()
			if (!rect) return null
			const raw = (event.clientX - rect.left) / zoom
			return event.shiftKey ? Math.round(raw) : Math.round(raw / SNAP) * SNAP
		}

		const deferred = DEFERRED.has(dragging.kind)

		const onMove = (event: PointerEvent) => {
			const x = positionOf(event)
			if (x === null) return
			if (deferred) {
				previewRef.current = x
				setPreview(x)
			} else {
				applyHandle(dragging, x)
			}
		}
		const onUp = () => {
			// Dibaca lewat ref, bukan state: efek React di-flush asinkron, jadi
			// penutupan ini bisa memegang posisi satu gerakan yang sudah basi.
			if (deferred && previewRef.current !== null) applyHandle(dragging, previewRef.current)
			previewRef.current = null
			setPreview(null)
			setDragging(null)
		}

		window.addEventListener('pointermove', onMove)
		window.addEventListener('pointerup', onUp)
		window.addEventListener('pointercancel', onUp)
		return () => {
			window.removeEventListener('pointermove', onMove)
			window.removeEventListener('pointerup', onUp)
			window.removeEventListener('pointercancel', onUp)
		}
	}, [dragging, zoom, applyHandle])

	const startDrag = (handle: Handle) => (event: React.PointerEvent) => {
		// Tanpa ini fokus pindah dari editor dan seleksi paragraf yang sedang
		// diindentasi ikut hilang.
		event.preventDefault()
		setDragging(handle)
	}

	const nudge = (handle: Handle, current: number) => (event: React.KeyboardEvent) => {
		const step = event.shiftKey ? 1 : NUDGE
		if (event.key === 'ArrowLeft') applyHandle(handle, current - step)
		else if (event.key === 'ArrowRight') applyHandle(handle, current + step)
		else return
		event.preventDefault()
	}

	const toScreen = (x: number) => x * zoom

	const firstLineX = margins.left + indent.left + indent.firstLine
	const indentLeftX = margins.left + indent.left
	const indentRightX = width - margins.right - indent.right

	// Marker paragraf disembunyikan selama tabel aktif: di dalam sel, ketiganya
	// menyasar paragraf DI DALAM sel, dan berdesakan dengan marker tepi serta
	// batas kolom di batang setinggi 24 px hanya menghasilkan salah klik.
	const hasIndentControls = editor !== null && target?.kind !== 'table'

	/** Posisi marker yang sedang diseret mengikuti pointer, bukan dokumen. */
	const live = (x: number, handle: Handle['kind'], index?: number) =>
		preview !== null &&
		dragging?.kind === handle &&
		(index === undefined || (dragging.kind === 'tableCol' && dragging.index === index))
			? preview
			: x

	const table =
		target?.kind === 'table'
			? (() => {
					const left = margins.left + target.indentLeft
					const edges: number[] = [left]
					for (const columnWidth of target.widths) edges.push(edges[edges.length - 1] + columnWidth)
					return { left, edges, right: edges[edges.length - 1] }
				})()
			: null

	const image =
		target?.kind === 'image'
			? {
					// Tanpa posisi bebas, marker berdiri di tepi kiri gambar seperti yang
					// digambar perataannya saat ini - jadi ia selalu menunjuk ke tempat
					// gambar itu benar-benar berada.
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
			aria-label="Penggaris halaman"
		>
			<div ref={trackRef} className="relative h-full">
				{/* Arsiran margin: area di luar batas tulis. */}
				<div className="document-ruler__margin" style={{ left: 0, width: toScreen(margins.left) }} />
				<div
					className="document-ruler__margin"
					style={{ left: toScreen(width - margins.right), width: toScreen(margins.right) }}
				/>

				<Ticks width={width} zoom={zoom} />

				<MarginHandle
					label="Margin kiri"
					x={toScreen(margins.left)}
					onPointerDown={startDrag({ kind: 'marginLeft' })}
					onKeyDown={nudge({ kind: 'marginLeft' }, margins.left)}
				/>
				<MarginHandle
					label="Margin kanan"
					x={toScreen(width - margins.right)}
					onPointerDown={startDrag({ kind: 'marginRight' })}
					onKeyDown={nudge({ kind: 'marginRight' }, width - margins.right)}
				/>

				{hasIndentControls && (
					<>
						<IndentHandle
							variant="first-line"
							label="Indentasi baris pertama"
							x={toScreen(firstLineX)}
							onPointerDown={startDrag({ kind: 'firstLine' })}
							onKeyDown={nudge({ kind: 'firstLine' }, firstLineX)}
						/>
						<IndentHandle
							variant="left"
							label="Indentasi kiri"
							x={toScreen(indentLeftX)}
							onPointerDown={startDrag({ kind: 'indentLeft' })}
							onKeyDown={nudge({ kind: 'indentLeft' }, indentLeftX)}
						/>
						<IndentHandle
							variant="right"
							label="Indentasi kanan"
							x={toScreen(indentRightX)}
							onPointerDown={startDrag({ kind: 'indentRight' })}
							onKeyDown={nudge({ kind: 'indentRight' }, indentRightX)}
						/>
					</>
				)}

				{table && (
					<>
						<ObjectHandle
							variant="table-edge"
							label="Tepi kiri tabel"
							x={toScreen(live(table.left, 'tableLeft'))}
							onPointerDown={startDrag({ kind: 'tableLeft' })}
							onKeyDown={nudge({ kind: 'tableLeft' }, table.left)}
						/>
						<ObjectHandle
							variant="table-edge"
							label="Tepi kanan tabel"
							x={toScreen(live(table.right, 'tableRight'))}
							onPointerDown={startDrag({ kind: 'tableRight' })}
							onKeyDown={nudge({ kind: 'tableRight' }, table.right)}
						/>
						{/* Hanya batas ANTAR kolom; kedua ujungnya sudah jadi marker tepi. */}
						{table.edges.slice(1, -1).map((edge, index) => (
							<ObjectHandle
								key={`col-${index}-${table.edges.length}`}
								variant="table-column"
								label={`Batas kolom ${index + 1} dan ${index + 2}`}
								x={toScreen(live(edge, 'tableCol', index))}
								onPointerDown={startDrag({ kind: 'tableCol', index })}
								onKeyDown={nudge({ kind: 'tableCol', index }, edge)}
							/>
						))}
					</>
				)}

				{image && (
					<>
						<ObjectHandle
							variant="image"
							label="Posisi gambar"
							x={toScreen(live(image.x, 'imageX'))}
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
	{ value: 'left' as const, label: 'Gambar rata kiri' },
	{ value: 'center' as const, label: 'Gambar rata tengah' },
	{ value: 'right' as const, label: 'Gambar rata kanan' },
]

/**
 * Bagi ulang total lebar ke seluruh kolom dengan proporsi yang sama.
 *
 * Dipakai saat salah satu TEPI tabel digeser: yang berubah lebar keseluruhan,
 * dan perbandingan antar kolom yang sudah diatur pengguna harus bertahan.
 */
function scaleWidths(widths: number[], total: number): number[] {
	const current = widths.reduce((sum, value) => sum + value, 0)
	if (current <= 0) return widths
	const factor = Math.max(total, MIN_COLUMN_WIDTH * widths.length) / current
	return widths.map((value) => Math.max(MIN_COLUMN_WIDTH, Math.round(value * factor)))
}

/**
 * Terjemahkan seretan marker tabel jadi perubahan dokumen.
 *
 * Tepi kiri dan tepi kanan adalah dua kendali yang menentukan lebar; lebar
 * bukan kendali ketiga. Menggeser satu tepi menahan tepi lainnya, lalu seluruh
 * kolom diskala ulang - jadi tidak ada keadaan yang saling bertentangan dan
 * tidak perlu aturan "siapa mengalah".
 *
 * Menggeser BATAS KOLOM berbeda sifatnya: ia hanya memindahkan pinjaman lebar
 * antara dua kolom bertetangga, sehingga kedua tepi tabel tidak bergerak.
 */
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
		setColumnWidths(editor, tablePos, scaleWidths(widths, right - nextLeft))
		return
	}

	if (handle.kind === 'tableRight') {
		const nextRight = clamp(x, left + floor, bounds.contentRight)
		setColumnWidths(editor, tablePos, scaleWidths(widths, nextRight - left))
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

/**
 * Garis skala, diukur dari tepi kiri lembar.
 *
 * Pada zoom kecil garis 1/8 inci saling menempel dan hanya jadi bercak abu,
 * jadi kerapatannya diturunkan alih-alih digambar sia-sia.
 */
function Ticks({ width, zoom }: { width: number; zoom: number }) {
	const step = zoom < 0.75 ? INCH / 4 : INCH / 8
	const count = Math.floor(width / step)

	return (
		<>
			{Array.from({ length: count + 1 }, (_, index) => {
				const x = index * step
				const isInch = Math.abs(x % INCH) < 0.01
				const isHalf = Math.abs(x % (INCH / 2)) < 0.01

				if (isInch) {
					// Angka nol tidak digambar: tepi lembar sudah jadi penandanya.
					if (x === 0) return null
					return (
						<span key={x} className="document-ruler__label" style={{ left: x * zoom }}>
							{Math.round(x / INCH)}
						</span>
					)
				}

				return (
					<span
						key={x}
						className={cn('document-ruler__tick', isHalf && 'document-ruler__tick--major')}
						style={{ left: x * zoom }}
					/>
				)
			})}
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

/** Marker tepi/batas untuk tabel & gambar - bentuknya beda dari marker paragraf. */
function ObjectHandle({
	variant,
	label,
	x,
	onPointerDown,
	onKeyDown,
}: {
	variant: 'table-edge' | 'table-column' | 'image'
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

/** Titik perataan gambar: diklik, tidak diseret. */
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
			// Tanpa ini fokus pindah dari editor dan seleksi node gambar hilang,
			// sehingga perintahnya kehilangan sasaran.
			onPointerDown={(event) => event.preventDefault()}
			onClick={onSelect}
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
