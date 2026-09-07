'use client'

import type { CSSProperties } from 'react'
import type { PageMargins } from '@/features/editor/page-geometry'
import {
	type FurnitureSlot,
	type FurnitureVariant,
	type PageFurniture,
	replacePageTokens,
	variantFor,
} from './model'

/**
 * Header/footer di dalam satu lembar halaman (T3/T4/T5). Dirender absolut di
 * area margin — tidak memengaruhi tata letak naskah sama sekali.
 *
 * Posisi vertikal memakai margin header/footer sendiri (§4.3), bukan lagi
 * sepertiga margin isi. Isi kaya (fragmen ydoc) menang atas baris teks lama;
 * keduanya mengalami penggantian token {page}/{pages} dengan nomor yang sudah
 * diformat per section.
 */

function boxOf(
	margins: PageMargins,
	edge: 'top' | 'bottom',
	headerMargin: number,
	footerMargin: number,
): CSSProperties {
	const vertical = edge === 'top' ? { top: headerMargin } : { bottom: footerMargin }
	return { ...vertical, left: margins.left, right: margins.right }
}

function SlotFurniture({
	furniture,
	contentOf,
	hasVariant,
	slot,
	pageIndex,
	margins,
	edge,
	headerMargin,
	footerMargin,
	pageNumber,
	totalPages,
}: {
	furniture: PageFurniture | null
	contentOf?: (slot: FurnitureSlot, variant: FurnitureVariant) => string | null
	hasVariant?: (slot: FurnitureSlot, variant: FurnitureVariant) => boolean
	slot: FurnitureSlot
	pageIndex: number
	margins: PageMargins
	edge: 'top' | 'bottom'
	headerMargin: number
	footerMargin: number
	pageNumber: string
	totalPages: string
}) {
	const legacy = furniture?.[slot]
	const variant = variantFor(pageIndex, (candidate) =>
		Boolean(legacy?.[candidate] || hasVariant?.(slot, candidate)),
	)
	const html = contentOf?.(slot, variant) ?? null
	const line = legacy?.[variant] ?? null
	const style = boxOf(margins, edge, headerMargin, footerMargin)

	if (html) {
		return (
			/*
			 * Bukan HTML sembarang: isinya keluaran DOMSerializer atas
			 * `furnitureSchema()`, yang mematikan `link` - jadi tidak ada jalan
			 * `javascript:` - dan hanya menerbitkan atribut yang dideklarasikan node
			 * spec, sehingga penangan inline seperti `onerror` tidak mungkin muncul.
			 * Lembar yang sedang disunting memakai editor sungguhan; ini salinan
			 * statis untuk lembar lainnya.
			 */
			<div
				className="furniture-box pointer-events-none absolute text-[10px] leading-4 text-faint"
				style={style}
				// biome-ignore lint/security/noDangerouslySetInnerHtml: keluaran DOMSerializer atas skema terbatas
				dangerouslySetInnerHTML={{ __html: replacePageTokens(html, pageNumber, totalPages) }}
			/>
		)
	}
	if (line) {
		return (
			<div
				className="furniture-box pointer-events-none absolute text-[10px] leading-4 text-faint"
				style={{ ...style, textAlign: line.align }}
			>
				{replacePageTokens(line.text, pageNumber, totalPages)}
			</div>
		)
	}
	return null
}

export function SheetFurniture({
	furniture,
	contentOf,
	hasVariant,
	pageIndex,
	margins,
	headerMargin,
	footerMargin,
	pageNumber,
	totalPages,
}: {
	furniture: PageFurniture | null
	/** HTML statis isi kaya per slot+varian (dari useFurnitureContent). */
	contentOf?: (slot: FurnitureSlot, variant: FurnitureVariant) => string | null
	/** Kehadiran fragmen per slot+varian (kosong pun dihitung). */
	hasVariant?: (slot: FurnitureSlot, variant: FurnitureVariant) => boolean
	pageIndex: number
	margins: PageMargins
	/** Jarak header dari tepi atas kertas (px). */
	headerMargin: number
	/** Jarak footer dari tepi bawah kertas (px). */
	footerMargin: number
	/** Nomor halaman terformat (ikut penomoran section). */
	pageNumber: string
	/** Total halaman terformat untuk token {pages}. */
	totalPages: string
}) {
	return (
		<>
			<SlotFurniture
				furniture={furniture}
				contentOf={contentOf}
				hasVariant={hasVariant}
				slot="header"
				pageIndex={pageIndex}
				margins={margins}
				edge="top"
				headerMargin={headerMargin}
				footerMargin={footerMargin}
				pageNumber={pageNumber}
				totalPages={totalPages}
			/>
			<SlotFurniture
				furniture={furniture}
				contentOf={contentOf}
				hasVariant={hasVariant}
				slot="footer"
				pageIndex={pageIndex}
				margins={margins}
				edge="bottom"
				headerMargin={headerMargin}
				footerMargin={footerMargin}
				pageNumber={pageNumber}
				totalPages={totalPages}
			/>
		</>
	)
}
