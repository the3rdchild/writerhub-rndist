/**
 * Bentuk tata letak halaman yang dibagi `apps/api` dan `apps/web`.
 *
 * Tipe di sini sengaja meniru persis apa yang tersimpan di Y.Doc lokal
 * (`apps/web/features/editor/page-geometry.ts` dan `page-furniture/model.ts`),
 * supaya sinkronisasi hanya memindahkan nilai, bukan menerjemahkan model.
 * Keduanya kompatibel secara struktural; kalau salah satu berubah, yang lain
 * harus ikut.
 */

import type { DocumentTypography } from './typography'

export type PageOrientation = 'portrait' | 'landscape'

export type PageSizeId =
	| 'letter'
	| 'tabloid'
	| 'legal'
	| 'statement'
	| 'executive'
	| 'folio'
	| 'a3'
	| 'a4'
	| 'a5'
	| 'b4'
	| 'b5'
	| 'custom'

/** Satuan piksel CSS pada 96 DPI, sama seperti di editor. */
export interface PageMargins {
	top: number
	right: number
	bottom: number
	left: number
}

export interface PageSetup {
	size: PageSizeId
	customWidth?: number
	customHeight?: number
	orientation: PageOrientation
	margins: PageMargins
	pageColor: string | null
	pageless: boolean
}

export type FurnitureSlot = 'header' | 'footer'
export type FurnitureVariant = 'default' | 'first' | 'even'

export interface PageFurnitureLine {
	/** Teks polos; token `{page}` diganti nomor halaman saat dirender. */
	text: string
	align: 'left' | 'center' | 'right'
}

export interface PageFurniture {
	header?: Partial<Record<FurnitureVariant, PageFurnitureLine>>
	footer?: Partial<Record<FurnitureVariant, PageFurnitureLine>>
}

/**
 * Tata letak utuh satu dokumen/tab. Dipakai oleh `documents.layout` (dasar
 * dokumen) dan `TemplateSpec.layout` - keduanya selalu punya `pageSetup`.
 * Kolom section tidak masuk sini: ia sudah menjadi atribut node
 * `sectionBreak` di dalam konten.
 */
export interface TabLayout {
	pageSetup: PageSetup
	furniture?: PageFurniture
	typography?: DocumentTypography
}

/**
 * Penimpa per tab pada `document_tabs.layout`, mengikuti model Y.Doc: tab
 * hanya menyimpan bagian yang ia timpa dari dasar dokumen, jadi keduanya
 * opsional. Tab tanpa baris `layout` mewarisi `documents.layout`.
 */
export interface TabLayoutOverride {
	pageSetup?: PageSetup
	furniture?: PageFurniture
	typography?: DocumentTypography
}
