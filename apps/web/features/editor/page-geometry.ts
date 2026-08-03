/**
 * Ukuran lembar dokumen, dalam piksel CSS pada 96 dpi.
 *
 * Semua perhitungan halaman — paginasi, nomor halaman, zoom, penggaris, dan
 * cetak — bersumber dari satu tempat ini. Mengganti ukuran kertas atau margin
 * cukup dilakukan di sini.
 */

/** Satu inci pada 96 dpi: satuan dasar margin dan penggaris. */
export const INCH = 96

export const PAGE_SIZES = {
	a4: { label: 'A4', width: 794, height: 1123 },
	letter: { label: 'Letter', width: 816, height: 1056 },
} as const

export type PageSizeId = keyof typeof PAGE_SIZES

export const DEFAULT_PAGE_SIZE: PageSizeId = 'a4'

export interface PageMargins {
	top: number
	right: number
	bottom: number
	left: number
}

/** Margin 1 inci, seperti bawaan pengolah kata pada umumnya. */
export const DEFAULT_MARGINS: PageMargins = { top: INCH, right: INCH, bottom: INCH, left: INCH }

/**
 * Batas bawah area teks. Penggaris boleh diseret ke mana saja selama lembar
 * masih menyisakan ruang tulis — tanpa batas ini margin kiri dan kanan bisa
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
	/** Tinggi area teks per halaman — dasar perhitungan pemenggalan. */
	contentHeight: number
	/** Jarak dari awal satu halaman ke awal halaman berikutnya. */
	pageStride: number
}

/** Pangkas margin supaya area teks tidak pernah lebih kecil dari batas minimum. */
export function clampMargins(
	margins: PageMargins,
	size: PageSizeId = DEFAULT_PAGE_SIZE,
): PageMargins {
	const { width, height } = PAGE_SIZES[size]

	const clampPair = (start: number, end: number, extent: number, minContent: number) => {
		const first = Math.max(0, Math.min(start, extent - minContent))
		const second = Math.max(0, Math.min(end, extent - minContent - first))
		return [first, second] as const
	}

	const [left, right] = clampPair(margins.left, margins.right, width, MIN_CONTENT_WIDTH)
	const [top, bottom] = clampPair(margins.top, margins.bottom, height, MIN_CONTENT_HEIGHT)

	return { top, right, bottom, left }
}

export function pageGeometry(
	size: PageSizeId = DEFAULT_PAGE_SIZE,
	margins: PageMargins = DEFAULT_MARGINS,
): PageGeometry {
	const { width, height } = PAGE_SIZES[size]
	const safe = clampMargins(margins, size)

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
