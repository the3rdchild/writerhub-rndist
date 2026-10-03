'use client'

import { type NodeViewProps, NodeViewWrapper } from '@tiptap/react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { placeCursorBeside } from '@/features/editor/insert-point'

type HandleId = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w'

const CORNERS: HandleId[] = ['nw', 'ne', 'se', 'sw']
const EDGES: HandleId[] = ['n', 'e', 's', 'w']

const MIN_PX = 24

export function ResizableImageView({
	node,
	updateAttributes,
	selected,
	deleteNode,
	editor,
	getPos,
}: NodeViewProps) {
	const { src, alt, title, width, height, align, offsetX } = node.attrs as {
		src: string
		alt: string | null
		title: string | null
		width: number | null
		height: number | null
		align: 'left' | 'center' | 'right' | null
		offsetX: number | null
	}
	const isLegacyPercent = height === null && width !== null && width <= 100

	const imgRef = useRef<HTMLImageElement>(null)
	const [naturalRatio, setNaturalRatio] = useState(0)
	const [drag, setDrag] = useState<{
		handle: HandleId
		startX: number
		startY: number
		startW: number
		startH: number
		/** Batas seret: lebar kolom dan tinggi area isi halaman. */
		maxW: number
		maxH: number
	} | null>(null)
	const previewRef = useRef<{ w: number; h: number } | null>(null)
	const [preview, setPreview] = useState<{ w: number; h: number } | null>(null)

	const putPreview = useCallback((next: { w: number; h: number } | null) => {
		previewRef.current = next
		setPreview(next)
	}, [])

	useEffect(
		function dropPreviewOnSizeCommit() {
			previewRef.current = null
			setPreview(null)
		},
		[width, height],
	)

	const onImageLoad = useCallback(() => {
		if (!imgRef.current) return
		const { naturalWidth, naturalHeight } = imgRef.current
		if (naturalHeight > 0) setNaturalRatio(naturalWidth / naturalHeight)
	}, [])

	const startDrag = useCallback(
		(event: React.PointerEvent, handle: HandleId) => {
			event.preventDefault()
			event.stopPropagation()
			const img = imgRef.current
			if (!img) return
			const startW = img.offsetWidth
			const startH = img.offsetHeight
			/*
			 * Gambar tidak boleh diseret melewati lebar kolom (dulu atributnya
			 * 948 px sementara tampilannya terpotong 602 px - gepeng, OBJ-7) atau
			 * setinggi lebih dari area isi halaman (OBJ-14).
			 */
			const wrapper = img.closest('.resizable-image-wrapper') as HTMLElement | null
			const wrapperStyle = wrapper ? getComputedStyle(wrapper) : null
			const maxW = wrapper
				? wrapper.clientWidth -
					Number.parseFloat(wrapperStyle?.paddingLeft ?? '0') -
					Number.parseFloat(wrapperStyle?.paddingRight ?? '0')
				: Number.POSITIVE_INFINITY
			const pageHeight = Number.parseFloat(wrapperStyle?.getPropertyValue('--page-content-height') ?? '')
			const maxH = Number.isFinite(pageHeight) && pageHeight > 0 ? pageHeight : Number.POSITIVE_INFINITY
			setDrag({ handle, startX: event.clientX, startY: event.clientY, startW, startH, maxW, maxH })
			putPreview({ w: startW, h: startH })
		},
		[putPreview],
	)

	useEffect(
		function trackResizeDrag() {
			if (!drag) return

			const onMove = (event: PointerEvent) => {
				const dx = event.clientX - drag.startX
				const dy = event.clientY - drag.startY
				const isCorner = CORNERS.includes(drag.handle)

				let w = drag.startW
				let h = drag.startH

				if (drag.handle === 'e' || drag.handle === 'ne' || drag.handle === 'se') w = drag.startW + dx
				if (drag.handle === 'w' || drag.handle === 'nw' || drag.handle === 'sw') w = drag.startW - dx
				if (drag.handle === 's' || drag.handle === 'se' || drag.handle === 'sw') h = drag.startH + dy
				if (drag.handle === 'n' || drag.handle === 'ne' || drag.handle === 'nw') h = drag.startH - dy

				w = Math.max(MIN_PX, w)
				h = Math.max(MIN_PX, h)
				if (isCorner && naturalRatio > 0) {
					if (Math.abs(w - drag.startW) >= Math.abs(h - drag.startH)) {
						h = Math.round(w / naturalRatio)
					} else {
						w = Math.round(h * naturalRatio)
					}
				}
				const ratio = isCorner && naturalRatio > 0 ? naturalRatio : 0
				if (w > drag.maxW) {
					w = drag.maxW
					if (ratio) h = Math.round(w / ratio)
				}
				if (h > drag.maxH) {
					h = drag.maxH
					if (ratio) w = Math.round(h * ratio)
				}

				putPreview({ w: Math.round(w), h: Math.round(h) })
			}
			const onUp = () => {
				setDrag(null)
				const final = previewRef.current
				if (final) {
					updateAttributes({ width: final.w, height: final.h })
				}
			}

			window.addEventListener('pointermove', onMove)
			window.addEventListener('pointerup', onUp)
			return () => {
				window.removeEventListener('pointermove', onMove)
				window.removeEventListener('pointerup', onUp)
			}
		},
		[drag, naturalRatio, putPreview, updateAttributes],
	)
	const figureWidth = preview ? preview.w : isLegacyPercent ? `${width}%` : (width ?? undefined)
	const imgHeight = preview ? preview.h : isLegacyPercent ? undefined : (height ?? undefined)
	const justify = align === 'center' ? 'center' : align === 'right' ? 'flex-end' : 'flex-start'
	/*
	 * Rasio tampil dari ukuran tersimpan: lebar boleh dibatasi kolom atau tinggi
	 * halaman (CSS `.resizable-image-figure`), tingginya selalu ikut - dulu
	 * tinggi tetap dalam piksel membuat gambar gepeng saat lebarnya terpotong.
	 */
	const shownW = preview ? preview.w : isLegacyPercent ? null : width
	const shownH = preview ? preview.h : isLegacyPercent ? null : height
	const ratio = shownW && shownH ? shownW / shownH : null

	/*
	 * Klik di ruang kosong baris gambar (di luar gambarnya) menaruh kursor di
	 * sisi gambar, bukan memilih gambar - dulu ketikan berikutnya menghapus
	 * gambar itu (OBJ-6).
	 */
	const onWrapperMouseDown = (event: React.MouseEvent<HTMLDivElement>) => {
		if (event.button !== 0 || (event.target as HTMLElement).closest('.resizable-image-figure')) return
		const pos = typeof getPos === 'function' ? getPos() : undefined
		if (typeof pos !== 'number') return
		const figure = event.currentTarget.querySelector('.resizable-image-figure')
		const rect = figure?.getBoundingClientRect()
		const side = rect && event.clientX < rect.left ? 'before' : 'after'
		event.preventDefault()
		editor.view.dispatch(placeCursorBeside(editor.state.tr, pos, side))
		editor.view.focus()
	}

	return (
		<NodeViewWrapper
			className="resizable-image-wrapper"
			onMouseDown={onWrapperMouseDown}
			data-selected={selected || undefined}
			data-align={align ?? undefined}
			style={{
				display: 'flex',
				justifyContent: offsetX === null ? justify : 'flex-start',
				paddingLeft: offsetX === null ? undefined : Math.max(0, offsetX),
			}}
		>
			<figure
				className="resizable-image-figure relative inline-block"
				style={{ width: figureWidth, ...(ratio ? { '--image-ratio': ratio } : {}) } as React.CSSProperties}
			>
				<img
					ref={imgRef}
					src={src}
					alt={alt ?? ''}
					title={title ?? undefined}
					onLoad={onImageLoad}
					draggable={false}
					className="block h-auto w-full rounded-lg"
					style={ratio ? { aspectRatio: String(ratio) } : { height: imgHeight }}
				/>
				{/* Handle hanya saat terpilih. */}
				{selected && (
					<>
						{/* POJOK: pertahankan rasio. */}
						{CORNERS.map((h) => (
							<button
								key={h}
								type="button"
								aria-label="Resize (corner, keeps ratio)"
								onPointerDown={(e) => startDrag(e, h)}
								className={`resizable-image-handle resizable-image-handle--corner resizable-image-handle--${h}`}
							/>
						))}
						{/* SISI: distort rasio. */}
						{EDGES.map((h) => (
							<button
								key={h}
								type="button"
								aria-label="Resize (side, changes ratio)"
								onPointerDown={(e) => startDrag(e, h)}
								className={`resizable-image-handle resizable-image-handle--edge resizable-image-handle--${h}`}
							/>
						))}
						<button
							type="button"
							aria-label="Delete image"
							onClick={(e) => {
								e.stopPropagation()
								deleteNode()
							}}
							className="resizable-image-delete"
						>
							×
						</button>
					</>
				)}
			</figure>
		</NodeViewWrapper>
	)
}
