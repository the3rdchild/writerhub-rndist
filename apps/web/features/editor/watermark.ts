import type { Watermark, WatermarkAnchor } from '@writer-hub/shared'
import type { PageGeometry } from './page-geometry'

export type { Watermark, WatermarkAnchor } from '@writer-hub/shared'

export const DEFAULT_WATERMARK: Watermark = {
	kind: 'text',
	text: 'DRAF',
	anchor: 'center',
	offsetX: 0,
	offsetY: 0,
	scale: 0.6,
	opacity: 0.15,
	rotation: -45,
}

/** Kerapatan ubin - tetap untuk sekarang; lihat §8 WATERMARK-PLAN.md. */
export const TILE_COLUMNS = 3
export const TILE_ROWS = 4

/*
 * Jangkar tepi tidak menempel persis di garis margin: watermark yang menyentuh
 * batas kotak isi terlihat seperti salah cetak. Sisipan ini fraksi kotak isi,
 * jadi ia ikut mengecil di kertas kecil.
 */
const EDGE_INSET = 0.04

interface Axis {
	/** Titik jangkar sebagai fraksi kotak isi. */
	at: number
	/** Pergeseran relatif ukuran watermark sendiri, supaya sisinya yang menempel. */
	shift: number
}

function horizontalOf(anchor: WatermarkAnchor): Axis {
	if (anchor === 'top-left' || anchor === 'left' || anchor === 'bottom-left') {
		return { at: EDGE_INSET, shift: 0 }
	}
	if (anchor === 'top-right' || anchor === 'right' || anchor === 'bottom-right') {
		return { at: 1 - EDGE_INSET, shift: -100 }
	}
	return { at: 0.5, shift: -50 }
}

function verticalOf(anchor: WatermarkAnchor): Axis {
	if (anchor === 'top-left' || anchor === 'top' || anchor === 'top-right') {
		return { at: EDGE_INSET, shift: 0 }
	}
	if (anchor === 'bottom-left' || anchor === 'bottom' || anchor === 'bottom-right') {
		return { at: 1 - EDGE_INSET, shift: -100 }
	}
	return { at: 0.5, shift: -50 }
}

export interface WatermarkSlot {
	/** Fraksi lebar kotak isi. */
	left: number
	/** Fraksi tinggi kotak isi. */
	top: number
	/** Persen ukuran watermark sendiri - dipakai `translate()`. */
	shiftX: number
	shiftY: number
}

export interface WatermarkBox {
	/** Sudut kiri-atas bidang acuan, relatif kertas (px CSS). */
	left: number
	top: number
	width: number
	height: number
}

/**
 * Bidang acuan watermark pada satu lembar: kotak isi, atau kertas utuh bila
 * `bleed` menyala.
 *
 * Kotak isi adalah bawaannya karena itulah yang bisa dijanjikan kertas tanpa
 * syarat: lapisan cetak `fixed` selalu di-clip ke kotak margin `@page`.
 * `bleed` menukarnya dengan kertas utuh, dan menuntut jalur cetak bermargin nol
 * berikut bingkai berulangnya (lihat `document-paper.tsx`) supaya layar dan
 * kertas tetap menjanjikan hal yang sama.
 */
export function watermarkBox(watermark: Watermark, geometry: PageGeometry): WatermarkBox {
	if (watermark.bleed) {
		return { left: 0, top: 0, width: geometry.width, height: geometry.height }
	}
	return {
		left: geometry.margins.left,
		top: geometry.margins.top,
		width: geometry.contentWidth,
		height: geometry.contentHeight,
	}
}

/**
 * Titik-titik tempat watermark digambar. Satu untuk jangkar biasa, `n` untuk
 * ubin.
 *
 * Semuanya fraksi **bidang acuannya** (lihat `watermarkBox`), bukan kertas
 * begitu saja: tanpa `bleed`, isi halaman di-clip ke kotak margin `@page` saat
 * mencetak, jadi kertas utuh bukan bidang yang benar-benar tersedia. Penyaji
 * layar memakai kotak yang sama supaya keduanya tidak bisa berbeda.
 */
export function watermarkSlots(watermark: Watermark): WatermarkSlot[] {
	if (watermark.anchor === 'tile') {
		const slots: WatermarkSlot[] = []
		for (let row = 0; row < TILE_ROWS; row += 1) {
			for (let column = 0; column < TILE_COLUMNS; column += 1) {
				slots.push({
					left: (column + 0.5) / TILE_COLUMNS,
					top: (row + 0.5) / TILE_ROWS,
					shiftX: -50,
					shiftY: -50,
				})
			}
		}
		return slots
	}

	const horizontal = horizontalOf(watermark.anchor)
	const vertical = verticalOf(watermark.anchor)
	return [
		{
			left: horizontal.at + watermark.offsetX,
			top: vertical.at + watermark.offsetY,
			shiftX: horizontal.shift,
			shiftY: vertical.shift,
		},
	]
}

/** Ubin memakai satu ukuran per petak, bukan `scale` penuh sekotak isi. */
export function effectiveScale(watermark: Watermark): number {
	return watermark.anchor === 'tile' ? watermark.scale / TILE_COLUMNS : watermark.scale
}

/**
 * Ukuran watermark dalam piksel CSS, dihitung dari lebar bidang acuannya.
 *
 * Piksel, bukan persen: teks tidak bisa diukur dengan persen (persen pada
 * `font-size` mengacu ke induknya), dan px CSS bernilai sama di layar maupun di
 * kertas (1/96 inci), jadi satu angka melayani kedua penyaji.
 */
export function watermarkSizePx(watermark: Watermark, geometry: PageGeometry): number {
	return Math.max(1, watermarkBox(watermark, geometry).width * effectiveScale(watermark))
}

export function watermarkTransform(slot: WatermarkSlot, watermark: Watermark): string {
	return `translate(${slot.shiftX}%, ${slot.shiftY}%) rotate(${watermark.rotation}deg)`
}

/** Watermark yang tidak menggambar apa pun - kolom teks kosong, aset belum dipilih. */
export function watermarkIsEmpty(watermark: Watermark | undefined): boolean {
	if (!watermark) return true
	if (watermark.kind === 'text') return watermark.text?.trim().length === 0 || watermark.text === undefined
	return !watermark.assetId && !watermark.imageDataUrl
}
