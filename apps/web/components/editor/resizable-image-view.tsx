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
	const { src, alt, title, width, height, align, offsetX } = node.attrs as {
		src: string
		alt: string | null
		title: string | null
		width: number | null
		height: number | null
		align: 'left' | 'center' | 'right' | null
		offsetX: number | null
	}

	// Dokumen lama menyimpan `width` sebagai persen kontainer (10-100) dan tidak
	// pernah menulis `height`. Versi ini selalu menulis keduanya dalam piksel,
	// jadi lebar tanpa tinggi yang masih <= 100 pasti warisan format lama -
	// menafsirkannya sebagai piksel akan menyusutkan gambar jadi seukuran ikon.
	const isLegacyPercent = height === null && width !== null && width <= 100

	const imgRef = useRef<HTMLImageElement>(null)
	const [naturalRatio, setNaturalRatio] = useState(0)
	const [drag, setDrag] = useState<{ handle: HandleId; startX: number; startY: number; startW: number; startH: number } | null>(null)
	// Pratinjau ukuran saat menyeret; null = pakai atribut node. Disimpan ganda:
	// state untuk merender, ref untuk dibaca `pointerup`. Efek React di-flush
	// asinkron, jadi tanpa ref penutupan `onUp` bisa tertinggal satu gerakan
	// dan menyimpan ukuran yang basi.
	const previewRef = useRef<{ w: number; h: number } | null>(null)
	const [preview, setPreview] = useState<{ w: number; h: number } | null>(null)

	const putPreview = useCallback((next: { w: number; h: number } | null) => {
		previewRef.current = next
		setPreview(next)
	}, [])

	useEffect(() => {
		// Reset pratinjau bila atribut berubah dari luar (mis. undo).
		previewRef.current = null
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
			// Ukuran render nyata dipakai sebagai titik awal, bukan atribut node:
			// itu benar untuk lebar piksel maupun persen warisan, dan seretan
			// pertama sekaligus mengubah yang persen jadi piksel.
			const startW = img.offsetWidth
			const startH = img.offsetHeight
			setDrag({ handle, startX: event.clientX, startY: event.clientY, startW, startH })
			putPreview({ w: startW, h: startH })
		},
		[putPreview],
	)

	useEffect(() => {
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

			// POJOK menjaga rasio aspek: turunkan satu dimensi dari yang lain.
			// SISI dibiarkan mengubah satu dimensi saja sehingga rasionya memang
			// terdistorsi - itulah gunanya handle sisi.
			if (isCorner && naturalRatio > 0) {
				// Pakai dimensi yang berubah paling banyak sebagai acuan.
				if (Math.abs(w - drag.startW) >= Math.abs(h - drag.startH)) {
					h = Math.round(w / naturalRatio)
				} else {
					w = Math.round(h * naturalRatio)
				}
			}

			putPreview({ w: Math.round(w), h: Math.round(h) })
		}
		const onUp = () => {
			setDrag(null)
			// Simpan ke atribut saat selesai, bukan tiap gerakan - supaya riwayat
			// undo tidak berisik dan Yjs tidak kebanjiran transaksi.
			const final = previewRef.current
			if (final) {
				updateAttributes({ width: final.w, height: final.h })
			}
			// preview direset oleh efek [width,height] saat updateAttributes selesai.
		}

		window.addEventListener('pointermove', onMove)
		window.addEventListener('pointerup', onUp)
		return () => {
			window.removeEventListener('pointermove', onMove)
			window.removeEventListener('pointerup', onUp)
		}
		// `preview` sengaja di luar dependensi: nilainya dibaca lewat ref, jadi
		// listener tidak perlu dipasang ulang tiap gerakan pointer.
	}, [drag, naturalRatio, putPreview, updateAttributes])

	// Figure memegang lebarnya; <img> mengikuti penuh lewat class `w-full`
	// kecuali tinggi piksel eksplisit ikut disetel.
	const figureWidth = preview ? preview.w : isLegacyPercent ? `${width}%` : (width ?? undefined)
	const imgHeight = preview ? preview.h : isLegacyPercent ? undefined : (height ?? undefined)

	// Posisi bebas menang atas perataan: saat `offsetX` ada, gambar berlabuh di
	// kiri lalu digeser sejauh itu. Atribut `renderHTML` tidak sampai ke sini -
	// node view menggambar DOM-nya sendiri - jadi jaraknya dipasang eksplisit.
	const justify = align === 'center' ? 'center' : align === 'right' ? 'flex-end' : 'flex-start'

	return (
		<NodeViewWrapper
			className="resizable-image-wrapper"
			data-selected={selected || undefined}
			data-align={align ?? undefined}
			style={{
				display: 'flex',
				justifyContent: offsetX === null ? justify : 'flex-start',
				paddingLeft: offsetX === null ? undefined : Math.max(0, offsetX),
			}}
		>
			<figure className="resizable-image-figure relative inline-block max-w-full" style={{ width: figureWidth }}>
				<img
					ref={imgRef}
					src={src}
					alt={alt ?? ''}
					title={title ?? undefined}
					onLoad={onImageLoad}
					draggable={false}
					className="block h-auto w-full rounded-lg"
					style={{ height: imgHeight }}
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
