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

/** Satuan piksel CSS pada 96 DPI, sama seperti di editor. */
export const INCH = 96

/**
 * Ukuran kertas dalam piksel CSS pada 96 DPI - potret, sebelum orientasi
 * diterapkan.
 *
 * Ada di paket bersama karena tiga pihak memerlukannya dan dulu hanya satu yang
 * memilikinya: editor menghitung geometri lembar, API draf harus memberi tahu
 * model kanvas yang sedang dirancangnya, dan daftar `PageSizeId` di sini
 * sebelumnya ditulis tangan sebagai union terpisah yang harus dijaga tetap
 * sama. Sekarang union itu diturunkan dari tabelnya sendiri, jadi keduanya
 * tidak bisa lagi berselisih.
 */
export const PAGE_SIZES = {
	letter: { label: 'Letter (8,5" × 11")', width: 816, height: 1056 },
	tabloid: { label: 'Tabloid (11" × 17")', width: 1056, height: 1632 },
	legal: { label: 'Legal (8,5" × 14")', width: 816, height: 1344 },
	statement: { label: 'Statement (5,5" × 8,5")', width: 528, height: 816 },
	executive: { label: 'Executive (7,25" × 10,5")', width: 696, height: 1008 },
	folio: { label: 'Folio (8,5" × 13")', width: 816, height: 1248 },
	a3: { label: 'A3 (297 × 420 mm)', width: 1123, height: 1587 },
	a4: { label: 'A4 (210 × 297 mm)', width: 794, height: 1123 },
	a5: { label: 'A5 (148 × 210 mm)', width: 559, height: 794 },
	b4: { label: 'B4 (250 × 353 mm)', width: 945, height: 1334 },
	b5: { label: 'B5 (176 × 250 mm)', width: 665, height: 945 },
	custom: { label: 'Ukuran khusus', width: 0, height: 0 },
} as const

export type PageSizeId = keyof typeof PAGE_SIZES

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
