/**
 * Model "perabot halaman" — teks header/footer yang menempel di margin lembar.
 *
 * Fitur ini sengaja dipisah dari PageSetup: tata letak halaman adalah geometri
 * (pantas hidup di page-geometry), sedangkan header/footer adalah konten
 * tambahan yang bisa hidup sendiri tanpa menyentuh model editor inti.
 */

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

/** Token yang diganti nomor halaman (indeks 0 → halaman 1). */
export const PAGE_TOKEN = '{page}'

/** Token yang diganti total halaman dokumen — padanan NUMPAGES Word. */
export const PAGES_TOKEN = '{pages}'

/** Ganti kedua token dalam satu teks (html maupun teks polos). */
export function replacePageTokens(text: string, page: string, pages: string): string {
	return text.split(PAGE_TOKEN).join(page).split(PAGES_TOKEN).join(pages)
}

/** Varian (default/first/even) yang berlaku untuk sebuah halaman, menurut
 * predikat kehadiran varian (baris lama, fragmen kaya, atau keduanya). */
export function variantFor(pageIndex: number, has: (variant: FurnitureVariant) => boolean): FurnitureVariant {
	if (pageIndex === 0 && has('first')) return 'first'
	if (pageIndex % 2 === 1 && has('even')) return 'even'
	return 'default'
}

/** Varian (default/first/even) yang berlaku untuk sebuah halaman. */
export function furnitureVariantFor(
	furniture: PageFurniture | null | undefined,
	slot: FurnitureSlot,
	pageIndex: number,
): FurnitureVariant {
	const variants = furniture?.[slot]
	return variantFor(pageIndex, (variant) => Boolean(variants?.[variant]))
}

/**
 * Varian yang berlaku untuk sebuah halaman, meniru aturan Word:
 * halaman pertama pakai `first`, halaman genap pakai `even`, sisanya `default`.
 */
export function furnitureLineFor(
	furniture: PageFurniture | null | undefined,
	slot: FurnitureSlot,
	pageIndex: number,
): PageFurnitureLine | null {
	if (!furniture) return null
	const variants = furniture[slot]
	if (!variants) return null

	return variants[furnitureVariantFor(furniture, slot, pageIndex)] ?? null
}

export function hasFurniture(furniture: PageFurniture | null | undefined): boolean {
	if (!furniture) return false
	return (
		Object.values(furniture.header ?? {}).some(Boolean) || Object.values(furniture.footer ?? {}).some(Boolean)
	)
}

const ALIGNS = new Set(['left', 'center', 'right'])
const VARIANTS = new Set(['default', 'first', 'even'])

function normalizeLine(raw: unknown): PageFurnitureLine | null {
	if (!raw || typeof raw !== 'object') return null
	const { text, align } = raw as { text?: unknown; align?: unknown }
	if (typeof text !== 'string' || text.length === 0) return null
	if (typeof align !== 'string' || !ALIGNS.has(align)) return null
	return { text, align: align as PageFurnitureLine['align'] }
}

function normalizeSlot(raw: unknown): Partial<Record<FurnitureVariant, PageFurnitureLine>> | null {
	if (!raw || typeof raw !== 'object') return null
	const out: Partial<Record<FurnitureVariant, PageFurnitureLine>> = {}
	for (const [variant, line] of Object.entries(raw as Record<string, unknown>)) {
		if (!VARIANTS.has(variant)) continue
		const normalized = normalizeLine(line)
		if (normalized) out[variant as FurnitureVariant] = normalized
	}
	return Object.keys(out).length > 0 ? out : null
}

/**
 * Validasi bentuk bebas (mis. dari meta Y.Doc) menjadi PageFurniture.
 * Mengembalikan null bila tidak ada satu pun baris yang sah.
 */
export function normalizePageFurniture(raw: unknown): PageFurniture | null {
	if (!raw || typeof raw !== 'object') return null
	const { header, footer } = raw as { header?: unknown; footer?: unknown }

	const furniture: PageFurniture = {}
	const normalizedHeader = normalizeSlot(header)
	if (normalizedHeader) furniture.header = normalizedHeader
	const normalizedFooter = normalizeSlot(footer)
	if (normalizedFooter) furniture.footer = normalizedFooter

	return hasFurniture(furniture) ? furniture : null
}
