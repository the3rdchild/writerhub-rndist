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
	/** Jarak tepi atas kertas ke baris pertama header (px CSS 96 DPI). */
	headerMargin?: number
	/** Jarak tepi bawah kertas ke baris terakhir footer (px CSS 96 DPI). */
	footerMargin?: number
	/** Penomoran halaman bagian pertama; bagian lain membawanya lewat atribut
	 * node `sectionBreak`. Tanpa ini: desimal, lanjut mengalir. */
	pageNumbering?: PageNumbering
	/** Watermark di bawah teks, sama di semua halaman tab ini. */
	watermark?: Watermark
}

/**
 * Jangkar watermark di dalam **kotak isi** halaman (area di dalam margin),
 * bukan di dalam kertas utuh.
 *
 * Bukan pilihan gaya: saat mencetak, seluruh isi halaman di-clip ke kotak
 * margin `@page` - diukur langsung dari matriks PDF-nya. Watermark yang
 * dirancang melebar sampai tepi kertas akan terpotong tanpa peringatan, jadi
 * kotak acuannya dinyatakan apa adanya di sini dan penyaji layar memakai kotak
 * yang sama supaya layar tidak menjanjikan yang tidak bisa ditepati kertas.
 */
export type WatermarkAnchor =
	| 'center'
	| 'top-left'
	| 'top'
	| 'top-right'
	| 'left'
	| 'right'
	| 'bottom-left'
	| 'bottom'
	| 'bottom-right'
	| 'tile'

export interface Watermark {
	kind: 'text' | 'image'
	/** `kind: 'text'` - teks polos, tanpa token. */
	text?: string
	/** `kind: 'image'` - aset milik proyek, bukan berkas yang menempel di dokumen. */
	assetId?: string
	/**
	 * Gambar yang sudah disematkan sebagai data URI. HANYA diisi saat muatan
	 * ekspor dibangun dan TIDAK PERNAH disimpan: perender PDF berjalan di
	 * peladen dan tidak bisa diandalkan menjemput URL bertanda tangan yang
	 * berumur pendek.
	 */
	imageDataUrl?: string
	anchor: WatermarkAnchor
	/**
	 * Bidang acuannya kertas utuh, bukan kotak isi - watermark boleh menembus
	 * margin sampai tepi lembar.
	 *
	 * Di layar ini sekadar kotak yang lebih besar. Di kertas ia menuntut
	 * seluruh aliran cetak berubah: lapisan `fixed` selalu di-clip ke kotak
	 * margin `@page` (diukur, bukan diduga - lihat print-pages.test.ts), jadi
	 * satu-satunya cara menembusnya adalah `@page { margin: 0 }` dengan
	 * marginnya dipindah ke bingkai cetak yang berulang tiap halaman.
	 *
	 * Opsional supaya dokumen lama tetap sah; kosong berarti terkurung margin.
	 */
	bleed?: boolean
	/** Geseran dari jangkar, sebagai fraksi lebar/tinggi bidang acuannya. */
	offsetX: number
	offsetY: number
	/** Lebar watermark sebagai fraksi lebar bidang acuannya. */
	scale: number
	opacity: number
	/** Derajat, searah jarum jam. */
	rotation: number
}

export type PageNumberFormat = 'decimal' | 'lower-roman' | 'upper-roman' | 'lower-alpha' | 'upper-alpha'

export interface PageNumbering {
	format: PageNumberFormat
	/** Lanjut mengalir dari bagian sebelumnya, atau mulai ulang dari N. */
	restart: 'continue' | number
	/**
	 * Nomor ditampilkan pada bagian ini. `false` = bagian ini tanpa nomor —
	 * satu-satunya cara pengguna membersihkan penomoran, entah untuk halaman
	 * sampul saja atau untuk sederet halaman lewat pemisah bagian.
	 *
	 * Opsional supaya dokumen lama tetap sah; kosong berarti ditampilkan.
	 * Penghitungnya tetap berjalan di bagian yang disembunyikan, persis seperti
	 * Word: halaman tanpa nomor tetap terhitung.
	 */
	show?: boolean
}

const ROMAN_PAIRS: [number, string][] = [
	[1000, 'M'],
	[900, 'CM'],
	[500, 'D'],
	[400, 'CD'],
	[100, 'C'],
	[90, 'XC'],
	[50, 'L'],
	[40, 'XL'],
	[10, 'X'],
	[9, 'IX'],
	[5, 'V'],
	[4, 'IV'],
	[1, 'I'],
]

function toRoman(value: number): string {
	let rest = value
	let out = ''
	for (const [amount, glyph] of ROMAN_PAIRS) {
		while (rest >= amount) {
			out += glyph
			rest -= amount
		}
	}
	return out
}

/** A..Z lalu AA..ZZ (basis-26 bijektif, seperti penomoran Word). */
function toAlpha(value: number): string {
	let rest = value
	let out = ''
	do {
		rest -= 1
		out = String.fromCharCode(65 + (rest % 26)) + out
		rest = Math.floor(rest / 26)
	} while (rest > 0)
	return out
}

export function formatPageNumber(value: number, format: PageNumberFormat): string {
	const safe = Math.max(0, Math.floor(value))
	switch (format) {
		case 'lower-roman':
			return safe === 0 ? '0' : toRoman(safe).toLowerCase()
		case 'upper-roman':
			return safe === 0 ? '0' : toRoman(safe)
		case 'lower-alpha':
			return safe === 0 ? '0' : toAlpha(safe).toLowerCase()
		case 'upper-alpha':
			return safe === 0 ? '0' : toAlpha(safe)
		default:
			return String(safe)
	}
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
