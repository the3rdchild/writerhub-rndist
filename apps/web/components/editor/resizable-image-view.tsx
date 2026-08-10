'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { type NodeViewProps, NodeViewWrapper } from '@tiptap/react'

/**
 * Tampilan node gambar yang bisa diubah ukurannya lewat handle di sudut.
 *
 * Mempertahankan rasio aspek dari ukuran asli; lebar disimpan sebagai
 * persentase kontainer supaya tahan terhadap perbesaran halaman (zoom), bukan
 * piksel absolut. Handle muncul hanya saat node terpilih.
 */
export function ResizableImageView({
	node,
	updateAttributes,
	selected,
	editor,
	deleteNode,
}: NodeViewProps) {
	const { src, alt, title, width, height } = node.attrs as {
		src: string
		alt: string | null
		title: string | null
		width: number | null
		height: number | null
	}

	const imgRef = useRef<HTMLImageElement>(null)
	const [naturalRatio, setNaturalRatio] = useState(0)
	const [dragging, setDragging] = useState(false)
	// Lebar sebagai persen kontainer untuk handle seret; null saat gambar
	// memakai dimensi piksel eksplisit (hasil impor DOCX).
	const [displayWidth, setDisplayWidth] = useState<number | null>(
		width !== null && height === null ? width : null,
	)

	useEffect(() => {
		if (width !== null && height === null) setDisplayWidth(width)
		else setDisplayWidth(null)
	}, [width, height])

	const onImageLoad = useCallback(() => {
		if (!imgRef.current) return
		const { naturalWidth, naturalHeight } = imgRef.current
		if (naturalHeight > 0) setNaturalRatio(naturalWidth / naturalHeight)
	}, [])

	const startDrag = useCallback((event: React.PointerEvent) => {
		// Jangan mengganggu seleksi editor saat menyeret handle.
		event.preventDefault()
		event.stopPropagation()
		setDragging(true)
	}, [])

	// Penyeretan dirotasi ke window supaya pointer tetap terlacak meski keluar
	// dari gambar.
	useEffect(() => {
		if (!dragging) return

		const container = imgRef.current?.parentElement?.parentElement
		if (!container) return

		const onMove = (event: PointerEvent) => {
			const rect = container.getBoundingClientRect()
			if (rect.width === 0) return
			const pct = ((event.clientX - rect.left) / rect.width) * 100
			const clamped = Math.min(100, Math.max(10, pct))
			setDisplayWidth(clamped)
		}
		const onUp = () => {
			setDragging(false)
			// Simpan ke atribut node saat penyeretan selesai, bukan tiap gerakan -
			// terlalu banyak transaksi membuat riwayat undo berisik.
			if (displayWidth !== null) {
				updateAttributes({ width: Math.round(displayWidth) })
			}
		}

		window.addEventListener('pointermove', onMove)
		window.addEventListener('pointerup', onUp)
		return () => {
			window.removeEventListener('pointermove', onMove)
			window.removeEventListener('pointerup', onUp)
		}
	}, [dragging, displayWidth, updateAttributes])

	return (
		<NodeViewWrapper className="resizable-image-wrapper" data-selected={selected || undefined}>
			<figure
				className="resizable-image-figure relative inline-block max-w-full"
				style={
					displayWidth
						? { width: `${displayWidth}%` }
						: height && width
							? { width: `${width}px`, height: `${height}px` }
							: undefined
				}
			>
				<img
					ref={imgRef}
					src={src}
					alt={alt ?? ''}
					title={title ?? undefined}
					onLoad={onImageLoad}
					draggable={false}
					// Saat dimensi eksplisit dipakai (impor DOCX), biarkan CSS yang
					// mengatur ukuran; sebaliknya isi penuh pembungkus (mode persen).
					className="block h-auto w-full rounded-lg"
				/>
				{/* Handle pengubahan ukuran; muncul saat terpilih dan bukan gambar
				    dengan dimensi eksplisit dari DOCX. */}
				{selected && displayWidth !== null && (
					<>
						<button
							type="button"
							aria-label="Perkecil gambar"
							onPointerDown={startDrag}
							className="resizable-image-handle resizable-image-handle--br"
						/>
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
			{/* Rasio asli disimpan untuk referensi/debug; naturalRatio dipakai
			    mempertahankan proporsi saat tinggi diturunkan dari lebar. */}
			{naturalRatio > 0 && editor?.isEditable === false && null}
		</NodeViewWrapper>
	)
}
