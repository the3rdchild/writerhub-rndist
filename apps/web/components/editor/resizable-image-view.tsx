'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { type NodeViewProps, NodeViewWrapper } from '@tiptap/react'

/**
 * Tampilan node gambar blok yang bisa diubah ukurannya dari kedelapan arah.
 *
 * Delapan handle: empat POJOK (mempertahankan rasio aspek) dan empat SISI
 * (menyempit/memanjang hanya satu dimensi, membiaskan rasio). Lebar & tinggi
 * disimpan dalam piksel supaya hasilnya konsisten lintas perbesaran halaman;
 * rasio asli gambar diukur saat dimuat untuk perhitungan handle pojok.
 *
 * Perataan (`data-align`) memindahkan gambar ke kiri/tengah/kanan bloknya tanpa
 * mengganggu perataan teks paragraf di sekitarnya.
 */

type HandleId = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w'

const CORNERS: HandleId[] = ['nw', 'ne', 'se', 'sw']
const EDGES: HandleId[] = ['n', 'e', 's', 'w']

const MIN_PX = 24

export function ResizableImageView({
	node,
	updateAttributes,
	selected,
	deleteNode,
}: NodeViewProps) {
	const { src, alt, title, width, height, align } = node.attrs as {
		src: string
		alt: string | null
		title: string | null
		width: number | null
		height: number | null
		align: 'left' | 'center' | 'right' | null
	}

	const imgRef = useRef<HTMLImageElement>(null)
	const [naturalRatio, setNaturalRatio] = useState(0)
	const [drag, setDrag] = useState<{ handle: HandleId; startX: number; startY: number; startW: number; startH: number } | null>(null)
	// Pratinjau ukuran saat menyeret; null = pakai atribut node.
	const [preview, setPreview] = useState<{ w: number; h: number } | null>(null)

	useEffect(() => {
		// Reset pratinjau bila atribut berubah dari luar (mis. undo).
		setPreview(null)
	}, [width, height])

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
			const startW = width ?? img.offsetWidth
			const startH = height ?? img.offsetHeight
			setDrag({ handle, startX: event.clientX, startY: event.clientY, startW, startH })
			setPreview({ w: startW, h: startH })
		},
		[width, height],
	)

	useEffect(() => {
		if (!drag) return

		const onMove = (event: PointerEvent) => {
			const dx = event.clientX - drag.startX
			const dy = event.clientY - drag.startY
			const isCorner = CORNERS.includes(drag.handle)
			const isEdge = EDGES.includes(drag.handle)

			let w = drag.startW
			let h = drag.startH

			if (drag.handle === 'e' || drag.handle === 'ne' || drag.handle === 'se') w = drag.startW + dx
			if (drag.handle === 'w' || drag.handle === 'nw' || drag.handle === 'sw') w = drag.startW - dx
			if (drag.handle === 's' || drag.handle === 'se' || drag.handle === 'sw') h = drag.startH + dy
			if (drag.handle === 'n' || drag.handle === 'ne' || drag.handle === 'nw') h = drag.startH - dy

			w = Math.max(MIN_PX, w)
			h = Math.max(MIN_PX, h)

			// POJOK menjaga rasio aspek: turunkan satu dimensi dari yang lain.
			// SISI membiaskan rasio (hanya satu dimensi berubah) - itulah yang
			// diminta: "resize dari samping/atas/bawah menyempitkan ratio".
			if (isCorner && naturalRatio > 0) {
				// Pakai dimensi yang berubah paling banyak sebagai acuan.
				if (Math.abs(w - drag.startW) >= Math.abs(h - drag.startH)) {
					h = Math.round(w / naturalRatio)
				} else {
					w = Math.round(h * naturalRatio)
				}
			} else if (isEdge) {
				// Edge hanya mengubah satu dimensi; rasio sengaja didistori.
			}

			setPreview({ w: Math.round(w), h: Math.round(h) })
		}
		const onUp = () => {
			setDrag(null)
			// Simpan ke atribut saat selesai, bukan tiap gerakan - supaya riwayat
			// undo tidak berisik dan Yjs tidak kebanjiran transaksi.
			if (preview) {
				updateAttributes({ width: preview.w, height: preview.h })
			}
			// preview direset oleh efek [width,height] saat updateAttributes selesai.
		}

		window.addEventListener('pointermove', onMove)
		window.addEventListener('pointerup', onUp)
		return () => {
			window.removeEventListener('pointermove', onMove)
			window.removeEventListener('pointerup', onUp)
		}
	}, [drag, naturalRatio, preview, updateAttributes])

	const displayW = preview?.w ?? width ?? undefined
	const displayH = preview?.h ?? height ?? undefined

	const justify = align === 'center' ? 'center' : align === 'right' ? 'flex-end' : 'flex-start'

	return (
		<NodeViewWrapper
			className="resizable-image-wrapper"
			data-selected={selected || undefined}
			data-align={align ?? undefined}
			style={{ display: 'flex', justifyContent: justify }}
		>
			<figure className="resizable-image-figure relative inline-block max-w-full" style={{ width: displayW }}>
				<img
					ref={imgRef}
					src={src}
					alt={alt ?? ''}
					title={title ?? undefined}
					onLoad={onImageLoad}
					draggable={false}
					className="block h-auto w-full rounded-lg"
					style={{ width: displayW, height: displayH }}
				/>
				{/* Handle hanya saat terpilih. */}
				{selected && (
					<>
						{/* POJOK: pertahankan rasio. */}
						{CORNERS.map((h) => (
							<button
								key={h}
								type="button"
								aria-label="Ubah ukuran (pojok, jaga rasio)"
								onPointerDown={(e) => startDrag(e, h)}
								className={`resizable-image-handle resizable-image-handle--corner resizable-image-handle--${h}`}
							/>
						))}
						{/* SISI: distort rasio. */}
						{EDGES.map((h) => (
							<button
								key={h}
								type="button"
								aria-label="Ubah ukuran (sisi, ubah rasio)"
								onPointerDown={(e) => startDrag(e, h)}
								className={`resizable-image-handle resizable-image-handle--edge resizable-image-handle--${h}`}
							/>
						))}
						<button
							type="button"
							aria-label="Hapus gambar"
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
