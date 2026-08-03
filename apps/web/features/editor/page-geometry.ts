/**
 * Ukuran lembar dokumen, dalam piksel CSS pada 96 dpi.
 *
 * Semua perhitungan halaman — paginasi, nomor halaman, zoom, dan cetak —
 * bersumber dari satu tempat ini. Mengganti ukuran kertas atau margin cukup
 * dilakukan di sini.
 */

export const PAGE_SIZES = {
	a4: { label: 'A4', width: 794, height: 1123 },
	letter: { label: 'Letter', width: 816, height: 1056 },
} as const

export type PageSizeId = keyof typeof PAGE_SIZES

export const DEFAULT_PAGE_SIZE: PageSizeId = 'a4'

/** Margin 1 inci, seperti bawaan pengolah kata pada umumnya. */
export const PAGE_MARGIN = 96

/** Jarak antar lembar pada kanvas. */
export const PAGE_GAP = 32

export interface PageGeometry {
	width: number
	height: number
	margin: number
	gap: number
	/** Lebar area teks. */
	contentWidth: number
	/** Tinggi area teks per halaman — dasar perhitungan pemenggalan. */
	contentHeight: number
	/** Jarak dari awal satu halaman ke awal halaman berikutnya. */
	pageStride: number
}

export function pageGeometry(size: PageSizeId = DEFAULT_PAGE_SIZE): PageGeometry {
	const { width, height } = PAGE_SIZES[size]
	return {
		width,
		height,
		margin: PAGE_MARGIN,
		gap: PAGE_GAP,
		contentWidth: width - PAGE_MARGIN * 2,
		contentHeight: height - PAGE_MARGIN * 2,
		pageStride: height + PAGE_GAP,
	}
}

export const ZOOM_LEVELS = [0.5, 0.75, 0.9, 1, 1.25, 1.5, 2] as const
export type ZoomLevel = (typeof ZOOM_LEVELS)[number]
