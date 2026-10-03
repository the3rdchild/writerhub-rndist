'use client'

import { type RefObject, useEffect, useRef, useState } from 'react'
import { INCH } from './page-geometry'
export const RULER_SNAP = INCH / 16
export const RULER_NUDGE = RULER_SNAP

export function clamp(value: number, min: number, max: number): number {
	return Math.max(min, Math.min(value, max))
}

export function snapRulerPosition(raw: number, fine: boolean): number {
	return fine ? Math.round(raw) : Math.round(raw / RULER_SNAP) * RULER_SNAP
}

/** Gagang yang diseret sejauh ini menjauhi penggaris dianggap dilepas DARI penggaris (tab stop dibuang). */
export const RULER_DETACH = 24

export interface RulerDragOptions<H> {
	axis: 'x' | 'y'
	zoom: number
	trackRef: RefObject<HTMLElement | null>
	/** `outside`: penunjuk sedang jauh dari penggaris, tegak lurus arahnya. */
	onMove: (handle: H, pos: number, outside: boolean) => void
	onUp: (handle: H, pos: number | null, outside: boolean) => void
	/**
	 * Titik nol kisi jepret untuk gagang ini (bawaan 0 = tepi kertas). Tab stop
	 * diukur dari tepi area teksnya - di kolom 2 tepi itu tidak jatuh di kisi
	 * kertas - jadi kisinya ikut tepi itu, supaya 1 in tetap 72 pt.
	 */
	snapOrigin?: (handle: H) => number
}

/** Jepret `raw` ke kisi yang titik nolnya `origin`. */
export function snapFrom(origin: number, raw: number, fine: boolean): number {
	return origin + snapRulerPosition(raw - origin, fine)
}

/**
 * Titik nol kisi jepret gagang penggaris mendatar. Tab stop dan indentasi
 * diukur dari tepi area teksnya (margin kiri, atau tepi kolom) - indentasi
 * kanan dari tepi kanannya - jadi kisinya ikut tepi itu: di kolom 2 tepinya
 * tidak jatuh di kisi kertas, dan indentasi 0,5 in harus tetap 0,5 in.
 * Margin dan gagang lain diukur dari tepi kertas.
 */
export function rulerSnapOrigin(kind: string, textLeft: number, textWidth: number): number {
	switch (kind) {
		case 'tab':
		case 'firstLine':
		case 'indentLeft':
			return textLeft
		case 'indentRight':
			return textLeft + textWidth
		default:
			return 0
	}
}

export function useRulerDrag<H>({ axis, zoom, trackRef, onMove, onUp, snapOrigin }: RulerDragOptions<H>) {
	const [dragging, setDragging] = useState<H | null>(null)
	const lastRef = useRef<number | null>(null)
	const outsideRef = useRef(false)
	const onMoveRef = useRef(onMove)
	onMoveRef.current = onMove
	const onUpRef = useRef(onUp)
	onUpRef.current = onUp
	const snapOriginRef = useRef(snapOrigin)
	snapOriginRef.current = snapOrigin

	useEffect(
		function trackRulerDrag() {
			if (!dragging) return

			const positionOf = (event: PointerEvent) => {
				const rect = trackRef.current?.getBoundingClientRect()
				if (!rect) return null
				const raw = (axis === 'x' ? event.clientX - rect.left : event.clientY - rect.top) / zoom
				return snapFrom(snapOriginRef.current?.(dragging) ?? 0, raw, event.shiftKey)
			}

			const outsideOf = (event: PointerEvent) => {
				const rect = trackRef.current?.getBoundingClientRect()
				if (!rect) return false
				return axis === 'x'
					? event.clientY < rect.top - RULER_DETACH || event.clientY > rect.bottom + RULER_DETACH
					: event.clientX < rect.left - RULER_DETACH || event.clientX > rect.right + RULER_DETACH
			}

			const handleMove = (event: PointerEvent) => {
				const pos = positionOf(event)
				if (pos === null) return
				lastRef.current = pos
				outsideRef.current = outsideOf(event)
				onMoveRef.current(dragging, pos, outsideRef.current)
			}
			const handleUp = () => {
				onUpRef.current(dragging, lastRef.current, outsideRef.current)
				lastRef.current = null
				outsideRef.current = false
				setDragging(null)
			}

			window.addEventListener('pointermove', handleMove)
			window.addEventListener('pointerup', handleUp)
			window.addEventListener('pointercancel', handleUp)
			return () => {
				window.removeEventListener('pointermove', handleMove)
				window.removeEventListener('pointerup', handleUp)
				window.removeEventListener('pointercancel', handleUp)
			}
		},
		[dragging, axis, zoom, trackRef],
	)

	const startDrag = (handle: H) => (event: React.PointerEvent) => {
		event.preventDefault()
		lastRef.current = null
		outsideRef.current = false
		setDragging(handle)
	}

	return { dragging, startDrag }
}

export function rulerNudge<H>(
	axis: 'x' | 'y',
	handle: H,
	current: number,
	apply: (handle: H, pos: number) => void,
) {
	return (event: React.KeyboardEvent) => {
		const step = event.shiftKey ? 1 : RULER_NUDGE
		const back = axis === 'x' ? 'ArrowLeft' : 'ArrowUp'
		const forward = axis === 'x' ? 'ArrowRight' : 'ArrowDown'
		if (event.key === back) apply(handle, current - step)
		else if (event.key === forward) apply(handle, current + step)
		else return
		event.preventDefault()
	}
}
