import { INCH, PAGE_SIZES, type PageOrientation, type PageSizeId } from '@writer-hub/shared'

/*
 * Tabel ukuran kertas hidup di `@writer-hub/shared`: API draf memerlukannya
 * juga - ia harus memberi tahu model kanvas yang sedang dirancangnya - dan dua
 * salinan angka kertas adalah dua salinan yang akan berselisih.
 */
export { INCH, PAGE_SIZES, type PageOrientation, type PageSizeId } from '@writer-hub/shared'

export const DEFAULT_PAGE_SIZE: PageSizeId = 'a4'
export const MIN_CUSTOM_SIDE = 3 * INCH
export const MAX_CUSTOM_SIDE = 48 * INCH

export const DEFAULT_PAGE_ORIENTATION: PageOrientation = 'portrait'

export interface PageMargins {
	top: number
	right: number
	bottom: number
	left: number
}

export const DEFAULT_MARGINS: PageMargins = { top: INCH, right: INCH, bottom: INCH, left: INCH }

export interface PageSetup {
	size: PageSizeId
	customWidth?: number
	customHeight?: number
	orientation: PageOrientation
	margins: PageMargins
	pageColor: string | null
	pageless: boolean
}

export const DEFAULT_PAGE_SETUP: PageSetup = {
	size: DEFAULT_PAGE_SIZE,
	orientation: DEFAULT_PAGE_ORIENTATION,
	margins: DEFAULT_MARGINS,
	pageColor: null,
	pageless: false,
}

export function sameSheetGeometry(a: PageSetup, b: PageSetup): boolean {
	if (a.pageless !== b.pageless) return false
	const sizeA = resolvePageSize(a)
	const sizeB = resolvePageSize(b)
	return (
		sizeA.width === sizeB.width &&
		sizeA.height === sizeB.height &&
		a.margins.top === b.margins.top &&
		a.margins.right === b.margins.right &&
		a.margins.bottom === b.margins.bottom &&
		a.margins.left === b.margins.left
	)
}

export function resolvePageSize(setup: PageSetup): { width: number; height: number } {
	const base = PAGE_SIZES[setup.size]
	const w = setup.size === 'custom' ? (setup.customWidth ?? 0) : base.width
	const h = setup.size === 'custom' ? (setup.customHeight ?? 0) : base.height
	return setup.orientation === 'landscape' ? { width: h, height: w } : { width: w, height: h }
}

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

export const MIN_CONTENT_WIDTH = 96
export const MIN_CONTENT_HEIGHT = 96
export const PAGE_GAP = 32

export interface PageGeometry {
	width: number
	height: number
	margins: PageMargins
	gap: number
	contentWidth: number
	contentHeight: number
	pageStride: number
}

export interface SheetGeometry extends PageGeometry {
	index: number
	top: number
}

export function clampMargins(
	margins: PageMargins,
	size: PageSizeId | PageSetup = DEFAULT_PAGE_SETUP,
	orientation: PageOrientation = DEFAULT_PAGE_ORIENTATION,
): PageMargins {
	const setup: PageSetup = typeof size === 'string' ? { ...DEFAULT_PAGE_SETUP, size, orientation } : size
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
