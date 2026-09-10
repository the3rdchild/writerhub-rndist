'use client'

import type { CSSProperties } from 'react'
import { useAssetUrls } from '@/features/assets/use-assets'
import type { PageGeometry } from '@/features/editor/page-geometry'
import {
	type Watermark,
	watermarkBox,
	watermarkIsEmpty,
	watermarkSizePx,
	watermarkSlots,
	watermarkTransform,
} from '@/features/editor/watermark'

/**
 * Sumber gambar watermark yang siap dirender.
 *
 * Dua asal yang sengaja tidak dicampur: di layar, aset dijemput sebagai URL
 * bertanda tangan berumur pendek; di muatan ekspor, gambarnya sudah tersemat
 * sebagai data URI karena perender berjalan di peladen dan tidak bisa
 * diandalkan menjemput URL itu.
 */
export function useWatermarkSrc(watermark: Watermark | undefined): string | null {
	const assetId = watermark?.kind === 'image' && !watermark.imageDataUrl ? watermark.assetId : undefined
	const urls = useAssetUrls(assetId ? [assetId] : [])

	if (watermark?.kind !== 'image') return null
	if (watermark.imageDataUrl) return watermark.imageDataUrl
	return urls.data?.find((entry) => entry.id === watermark.assetId)?.url ?? null
}

/*
 * Teks tidak punya lebar yang bisa diminta lewat CSS - `font-size` mengatur
 * tinggi. Perkiraan lebar rata-rata glif untuk huruf tebal sans-serif dipakai
 * supaya satu `scale` bisa melayani teks maupun gambar: hasilnya mendekati
 * lebar yang diminta, dan pengguna tetap menyetelnya sambil melihat kanvas mini.
 */
const AVERAGE_GLYPH_WIDTH = 0.58

function fontSizeFor(text: string, widthPx: number): number {
	const glyphs = Math.max(2, text.trim().length)
	return Math.max(8, widthPx / (glyphs * AVERAGE_GLYPH_WIDTH))
}

function WatermarkItems({
	watermark,
	geometry,
	src,
}: {
	watermark: Watermark
	geometry: PageGeometry
	src: string | null
}) {
	const size = watermarkSizePx(watermark, geometry)
	const text = watermark.text ?? ''

	return (
		<>
			{watermarkSlots(watermark).map((slot) => {
				const base: CSSProperties = {
					left: `${slot.left * 100}%`,
					top: `${slot.top * 100}%`,
					transform: watermarkTransform(slot, watermark),
					opacity: watermark.opacity,
				}
				const key = `${slot.left}:${slot.top}`

				if (watermark.kind === 'image') {
					if (!src) return null
					return (
						/* biome-ignore lint/performance/noImgElement: sumbernya URL aset
						   bertanda tangan berumur menit, atau data URI yang sudah tersemat
						   untuk ekspor. next/image tidak bisa menolong keduanya - yang
						   pertama berarti memproksikan berkas privat ke cache yang lebih
						   panjang umurnya daripada izinnya, yang kedua tidak ada gunanya
						   dioptimalkan. Elemen ini juga harus tergambar apa adanya di
						   jalur cetak, tanpa lapisan pengoptimal apa pun. */
						<img
							key={key}
							className="document-watermark-item"
							src={src}
							alt=""
							style={{ ...base, width: size }}
						/>
					)
				}

				return (
					<span
						key={key}
						className="document-watermark-item document-watermark-text"
						style={{ ...base, fontSize: fontSizeFor(text, size) }}
					>
						{text}
					</span>
				)
			})}
		</>
	)
}

/**
 * Penyaji layar: satu salinan per lembar, di dalam bidang acuan lembar itu.
 *
 * Bawaannya kotak isi, bukan kertas utuh - saat mencetak, isi halaman di-clip
 * ke kotak margin `@page`, jadi watermark yang melebar sampai tepi kertas akan
 * terpotong. Layar memakai kotak yang sama supaya tidak menjanjikan yang tidak
 * bisa ditepati kertas. `bleed` menukarnya dengan kertas utuh, dan kertas
 * mengikutinya lewat bingkai cetak bermargin nol di `document-paper.tsx`.
 */
export function WatermarkLayer({
	watermark,
	geometry,
	src,
}: {
	watermark: Watermark | undefined
	geometry: PageGeometry
	src: string | null
}) {
	if (watermarkIsEmpty(watermark) || !watermark) return null

	const box = watermarkBox(watermark, geometry)

	return (
		<div
			aria-hidden="true"
			className="document-watermark"
			style={{ top: box.top, left: box.left, width: box.width, height: box.height }}
		>
			<WatermarkItems watermark={watermark} geometry={geometry} src={src} />
		</div>
	)
}

/**
 * Penyaji cetak: SATU lapisan `fixed` yang digandakan peramban ke tiap halaman.
 *
 * Ia harus berada di dalam `.document-print-root` (CSS cetak menyatakan yang
 * boleh dicetak secara positif - di luar itu lenyap) dan di luar
 * `.document-sheet-layer` (lapisan itu disembunyikan utuh saat mencetak, dan
 * itulah sebabnya header/footer tidak pernah tercetak).
 */
export function WatermarkPrintLayer({
	watermark,
	geometry,
	src,
}: {
	watermark: Watermark | undefined
	geometry: PageGeometry
	src: string | null
}) {
	if (watermarkIsEmpty(watermark) || !watermark) return null

	return (
		<div aria-hidden="true" className="document-watermark-print">
			<WatermarkItems watermark={watermark} geometry={geometry} src={src} />
		</div>
	)
}
