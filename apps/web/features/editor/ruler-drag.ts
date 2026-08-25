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

export interface RulerDragOptions<H> {
	axis: 'x' | 'y'
	zoom: number
	trackRef: RefObject<HTMLElement | null>
	onMove: (handle: H, pos: number) => void
	onUp: (handle: H, pos: number | null) => void
}
export function useRulerDrag<H>({ axis, zoom, trackRef, onMove, onUp }: RulerDragOptions<H>) {
	const [dragging, setDragging] = useState<H | null>(null)
	const lastRef = useRef<number | null>(null)
	const onMoveRef = useRef(onMove)
	onMoveRef.current = onMove
	const onUpRef = useRef(onUp)
	onUpRef.current = onUp

	useEffect(() => {
		if (!dragging) return

		const positionOf = (event: PointerEvent) => {
			const rect = trackRef.current?.getBoundingClientRect()
			if (!rect) return null
			const raw = (axis === 'x' ? event.clientX - rect.left : event.clientY - rect.top) / zoom
			return snapRulerPosition(raw, event.shiftKey)
		}

		const handleMove = (event: PointerEvent) => {
			const pos = positionOf(event)
			if (pos === null) return
			lastRef.current = pos
			onMoveRef.current(dragging, pos)
		}
		const handleUp = () => {
			onUpRef.current(dragging, lastRef.current)
			lastRef.current = null
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
	}, [dragging, axis, zoom, trackRef])

	const startDrag = (handle: H) => (event: React.PointerEvent) => {
		event.preventDefault()
		lastRef.current = null
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
