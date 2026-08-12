'use client'

import { type RefObject, useEffect, useRef, useState } from 'react'
import { INCH } from './page-geometry'

/**
 * Logika bersama penggaris horizontal & vertikal (§A3.2): snap, clamp, dan
 * plumbing seret pointer.
 *
 * Dulu aturan ini hanya hidup di document-ruler.tsx; diangkat ke sini supaya
 * kedua penggaris tidak menyimpan dua salinan aturan yang bisa berselisih.
 * Komponen penggaris hanya menyediakan batang (trackRef), menerjemahkan posisi
 * jadi perubahan margin/indentasi (onMove/onUp), dan menggambar marker.
 */

/** Seret menempel ke 1/16 inci; tahan Shift untuk gerak halus per piksel. */
export const RULER_SNAP = INCH / 16
export const RULER_NUDGE = RULER_SNAP

export function clamp(value: number, min: number, max: number): number {
	return Math.max(min, Math.min(value, max))
}

/** Posisi pointer dalam piksel dokumen, menempel ke SNAP kecuali Shift ditahan. */
export function snapRulerPosition(raw: number, fine: boolean): number {
	return fine ? Math.round(raw) : Math.round(raw / RULER_SNAP) * RULER_SNAP
}

export interface RulerDragOptions<H> {
	axis: 'x' | 'y'
	zoom: number
	/** Elemen batang penggaris; posisi pointer diukur dari tepi awalnya. */
	trackRef: RefObject<HTMLElement | null>
	/** Dipanggil tiap gerakan dengan posisi hasil snap (piksel dokumen). */
	onMove: (handle: H, pos: number) => void
	/** Dipanggil sekali saat pointer dilepas; pos null bila pointer tak bergerak. */
	onUp: (handle: H, pos: number | null) => void
}

/**
 * Kendali seret marker penggaris: memasang listener di window selama seretan
 * berlangsung (pointer boleh dilepas di mana saja, bahkan di luar jendela) dan
 * menerjemahkan posisi pointer ke piksel dokumen hasil snap.
 *
 * Callback disimpan di ref supaya listener - yang didirikan sekali per seretan -
 * selalu memanggil versi terbaru tanpa berlangganan ulang tiap render.
 */
export function useRulerDrag<H>({ axis, zoom, trackRef, onMove, onUp }: RulerDragOptions<H>) {
	const [dragging, setDragging] = useState<H | null>(null)
	// Posisi terakhir disimpan di ref: penutupan onUp bisa memegang state satu
	// gerakan yang sudah basi karena efek React di-flush asinkron.
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
		// Tanpa ini fokus pindah dari editor dan seleksi yang sedang diatur
		// ikut hilang.
		event.preventDefault()
		lastRef.current = null
		setDragging(handle)
	}

	return { dragging, startDrag }
}

/**
 * Geser marker lewat panah papan tik (Shift = per piksel), dengan arah panah
 * mengikuti sumbu penggarisnya.
 */
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
