/**
 * Ukuran lembar dokumen, dalam piksel CSS pada 96 dpi.
 *
 * Semua perhitungan halaman - paginasi, nomor halaman, zoom, penggaris, dan
 * cetak - bersumber dari satu tempat ini. Mengganti ukuran kertas atau margin
 * cukup dilakukan di sini.
 */

/** Satu inci pada 96 dpi: satuan dasar margin dan penggaris. */
export const INCH = 96

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

export const DEFAULT_PAGE_SIZE: PageSizeId = 'a4'

/** Batas ukuran khusus per sisi (piksel 96 dpi). 3 inci - 48 inci. */
export const MIN_CUSTOM_SIDE = 3 * INCH
export const MAX_CUSTOM_SIDE = 48 * INCH

/** Orientasi lembar. Landscape menukar lebar ↔ tinggi dari ukuran kertas. */
export type PageOrientation = 'portrait' | 'landscape'

export const DEFAULT_PAGE_ORIENTATION: PageOrientation = 'portrait'

export interface PageMargins {
	top: number
	right: number
	bottom: number
	left: number
}

/** Margin 1 inci, seperti bawaan pengolah kata pada umumnya. */
export const DEFAULT_MARGINS: PageMargins = { top: INCH, right: INCH, bottom: INCH, left: INCH }

/**
 * Tata letak halaman sebuah naskah.
 *
 * Hidup di Y.Doc (milik naskah, bukan pemakai) lewat `DocMeta.pageSetup` /
 * `TabMeta.pageSetup`; lihat PRD EDITOR-AI-UPGRADE §A1. Resolusi saat render:
 * `tab.pageSetup ?? doc.pageSetup ?? user.defaultPageSetup ?? DEFAULT_PAGE_SETUP`.
 */
export interface PageSetup {
	size: PageSizeId
	/** Hanya untuk size: 'custom'. Piksel 96 dpi, seperti seluruh modul ini. */
	customWidth?: number
	customHeight?: number
	orientation: PageOrientation
	margins: PageMargins
	/** Warna lembar; null = mengikuti tema (putih di terang, abu gelap di gelap). */
	pageColor: string | null
	/** true = kanvas menerus tanpa pemenggalan halaman. */
	pageless: boolean
}

/** Bawaan dokumen baru. Warna halaman null (ikuti tema) - putusan §9. */
export const DEFAULT_PAGE_SETUP: PageSetup = {
	size: DEFAULT_PAGE_SIZE,
	orientation: DEFAULT_PAGE_ORIENTATION,
	margins: DEFAULT_MARGINS,
	pageColor: null,
	pageless: false,
}

/** Lebar/tinggi kertas dari sebuah PageSetup, sudah menukar orientasi. */
export function resolvePageSize(setup: PageSetup): { width: number; height: number } {
	const base = PAGE_SIZES[setup.size]
	const w = setup.size === 'custom' ? setup.customWidth ?? 0 : base.width
	const h = setup.size === 'custom' ? setup.customHeight ?? 0 : base.height
	return setup.orientation === 'landscape' ? { width: h, height: w } : { width: w, height: h }
}

/**
 * Validasi ukuran khusus. Mengembalikan pesan kesalahan bila di luar batas,
 * atau null bila valid. Dipakai dialog Penyiapan halaman supaya input yang
 * ditolak tidak menghasilkan lembar tanpa area teks.
 */
export function validateCustomSize(width: number, height: number): string | null {
	if (!Number.isFinite(width) || !Number.isFinite(height)) return 'Ukuran harus berupa angka.'
	if (width < MIN_CUSTOM_SIDE || height < MIN_CUSTOM_SIDE) {
		return `Sisi terkecil ${MIN_CUSTOM_SIDE / INCH} inci.`
	}
	if (width > MAX_CUSTOM_SIDE || height > MAX_CUSTOM_SIDE) {
		return `Sisi terbesar ${MAX_CUSTOM_SIDE / INCH} inci.`
	}
	return null
}

/**
 * Batas bawah area teks. Penggaris boleh diseret ke mana saja selama lembar
 * masih menyisakan ruang tulis - tanpa batas ini margin kiri dan kanan bisa
 * bertemu, dan paginasi kehilangan tinggi baris untuk dihitung.
 */
export const MIN_CONTENT_WIDTH = 96
export const MIN_CONTENT_HEIGHT = 96

/** Jarak antar lembar pada kanvas. */
export const PAGE_GAP = 32

export interface PageGeometry {
	width: number
	height: number
	margins: PageMargins
	gap: number
	/** Lebar area teks. */
	contentWidth: number
	/** Tinggi area teks per halaman - dasar perhitungan pemenggalan. */
	contentHeight: number
	/** Jarak dari awal satu halaman ke awal halaman berikutnya. */
	pageStride: number
}

/** Pangkas margin supaya area teks tidak pernah lebih kecil dari batas minimum. */
export function clampMargins(
	margins: PageMargins,
	size: PageSizeId | PageSetup = DEFAULT_PAGE_SETUP,
	orientation: PageOrientation = DEFAULT_PAGE_ORIENTATION,
): PageMargins {
	const setup: PageSetup =
		typeof size === 'string'
			? { ...DEFAULT_PAGE_SETUP, size, orientation }
			: size
	const { width, height } = resolvePageSize(setup)

	const clampPair = (start: number, end: number, extent: number, minContent: number) => {
		const first = Math.max(0, Math.min(start, extent - minContent))
		const second = Math.max(0, Math.min(end, extent - minContent - first))
		return [first, second] as const
	}

	const [left, right] = clampPair(margins.left, margins.right, width, MIN_CONTENT_WIDTH)
	const [top, bottom] = clampPair(margins.top, margins.bottom, height, MIN_CONTENT_HEIGHT)

	return { top, right, bottom, left }
}

export function pageGeometry(setup: PageSetup = DEFAULT_PAGE_SETUP): PageGeometry {
	const { width, height } = resolvePageSize(setup)
	const safe = clampMargins(setup.margins, setup)

	return {
		width,
		height,
		margins: safe,
		gap: PAGE_GAP,
		contentWidth: width - safe.left - safe.right,
		contentHeight: height - safe.top - safe.bottom,
		pageStride: height + PAGE_GAP,
	}
}

export const ZOOM_LEVELS = [0.5, 0.75, 0.9, 1, 1.25, 1.5, 2] as const
export type ZoomLevel = (typeof ZOOM_LEVELS)[number]
