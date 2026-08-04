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

type Handle = 'marginLeft' | 'marginRight' | 'firstLine' | 'indentLeft' | 'indentRight'

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
	const trackRef = useRef<HTMLDivElement>(null)
	const [dragging, setDragging] = useState<Handle | null>(null)

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
			switch (handle) {
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
			}
		},
		[width, margins.left, margins.right, indent.left, onMarginsChange, setIndent],
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

		const onMove = (event: PointerEvent) => {
			const x = positionOf(event)
			if (x !== null) applyHandle(dragging, x)
		}
		const onUp = () => setDragging(null)

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
	const hasIndentControls = editor !== null

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
					onPointerDown={startDrag('marginLeft')}
					onKeyDown={nudge('marginLeft', margins.left)}
				/>
				<MarginHandle
					label="Margin kanan"
					x={toScreen(width - margins.right)}
					onPointerDown={startDrag('marginRight')}
					onKeyDown={nudge('marginRight', width - margins.right)}
				/>

				{hasIndentControls && (
					<>
						<IndentHandle
							variant="first-line"
							label="Indentasi baris pertama"
							x={toScreen(firstLineX)}
							onPointerDown={startDrag('firstLine')}
							onKeyDown={nudge('firstLine', firstLineX)}
						/>
						<IndentHandle
							variant="left"
							label="Indentasi kiri"
							x={toScreen(indentLeftX)}
							onPointerDown={startDrag('indentLeft')}
							onKeyDown={nudge('indentLeft', indentLeftX)}
						/>
						<IndentHandle
							variant="right"
							label="Indentasi kanan"
							x={toScreen(indentRightX)}
							onPointerDown={startDrag('indentRight')}
							onKeyDown={nudge('indentRight', indentRightX)}
						/>
					</>
				)}
			</div>
		</div>
	)
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
