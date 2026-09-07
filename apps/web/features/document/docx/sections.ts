/**
 * Section DOCX: ukuran kertas, margin, orientasi, dan kolom.
 *
 * `w:sectPr` menutup section, bukan membukanya - properti yang terbaca di
 * satu tempat berlaku untuk isi *sebelumnya*. Perangkaiannya ada di
 * `parse.ts`; di sini hanya pembacaan satu `sectPr` dan bentuk hasilnya.
 */
import type { JSONContent } from '@tiptap/core'
import type { PageNumberFormat, PageNumbering } from '@writer-hub/shared'
import {
	PAGE_SIZES,
	type PageMargins,
	type PageSetup,
	type PageSizeId,
} from '@/features/editor/page-geometry'
import { SECTION_BREAK_NODE } from '@/features/editor/section-break'
import { twipsToPx } from './units'
import { attr, child, val } from './xml'

export type PageSetupPatch = Partial<Omit<PageSetup, 'margins'>> & { margins?: Partial<PageMargins> }

export interface SectionProps {
	pageSetup: PageSetupPatch
	columns: { count: number; gap?: number } | null
	continuous?: boolean
}

/** w:pgNumType/w:fmt → format penomoran Writer Hub. */
const PGNUM_FORMATS: Record<string, PageNumberFormat> = {
	decimal: 'decimal',
	lowerRoman: 'lower-roman',
	upperRoman: 'upper-roman',
	lowerLetter: 'lower-alpha',
	upperLetter: 'upper-alpha',
	numberInDash: 'decimal',
}

function numberingOf(sectPr: Element): PageNumbering | undefined {
	const pgNumType = child(sectPr, 'pgNumType')
	if (!pgNumType) return undefined

	const format = PGNUM_FORMATS[attr(pgNumType, 'fmt') ?? '']
	const start = Number.parseInt(attr(pgNumType, 'start') ?? '', 10)
	/* Word: tanpa start, penomoran melanjutkan section sebelumnya. */
	const restart: PageNumbering['restart'] = Number.isFinite(start) && start >= 0 ? start : 'continue'
	return { format: format ?? 'decimal', restart }
}

function matchPageSize(width: number, height: number): PageSizeId | null {
	for (const [id, size] of Object.entries(PAGE_SIZES)) {
		if (id === 'custom') continue
		if (Math.abs(size.width - width) <= 2 && Math.abs(size.height - height) <= 2) {
			return id as PageSizeId
		}
	}
	return null
}

export function readSectPr(sectPr: Element): SectionProps {
	const pageSetup: PageSetupPatch = {}

	const numbering = numberingOf(sectPr)
	if (numbering) pageSetup.pageNumbering = numbering

	const pgSz = child(sectPr, 'pgSz')
	const width = twipsToPx(Number.parseInt(attr(pgSz, 'w') ?? '', 10))
	const height = twipsToPx(Number.parseInt(attr(pgSz, 'h') ?? '', 10))
	if (pgSz && width > 0 && height > 0) {
		const landscape = attr(pgSz, 'orient') === 'landscape'
		const upright = landscape && width > height ? { width: height, height: width } : { width, height }
		const size = matchPageSize(upright.width, upright.height)
		if (size) {
			pageSetup.size = size
		} else {
			pageSetup.size = 'custom'
			pageSetup.customWidth = upright.width
			pageSetup.customHeight = upright.height
		}
		pageSetup.orientation = landscape ? 'landscape' : 'portrait'
	}

	const pgMar = child(sectPr, 'pgMar')
	if (pgMar) {
		const margins: Partial<PageMargins> = {}
		for (const side of ['top', 'right', 'bottom', 'left'] as const) {
			const twips = Number.parseInt(attr(pgMar, side) ?? '', 10)
			if (Number.isFinite(twips)) margins[side] = Math.max(0, twipsToPx(twips))
		}
		if (Object.keys(margins).length > 0) pageSetup.margins = margins

		/* Jarak header/footer dari tepi kertas (w:header/w:footer, twips). */
		for (const [distanceAttr, field] of [
			['header', 'headerMargin'],
			['footer', 'footerMargin'],
		] as const) {
			const twips = Number.parseInt(attr(pgMar, distanceAttr) ?? '', 10)
			if (Number.isFinite(twips) && twips >= 0) pageSetup[field] = Math.max(0, twipsToPx(twips))
		}
	}

	let columns: SectionProps['columns'] = null
	const cols = child(sectPr, 'cols')
	const count = Number.parseInt(attr(cols, 'num') ?? '', 10)
	if (Number.isFinite(count) && count >= 2) {
		columns = { count }
		const space = Number.parseInt(attr(cols, 'space') ?? '', 10)
		if (Number.isFinite(space)) columns.gap = twipsToPx(space)
	}

	return { pageSetup, columns, ...(val(child(sectPr, 'type')) === 'continuous' ? { continuous: true } : {}) }
}

export function mergeSetup(base: PageSetup, patch: PageSetupPatch): PageSetup {
	return { ...base, ...patch, margins: { ...base.margins, ...patch.margins } }
}

/** Kolom pada section pertama dibawa lewat section break pembuka yang menerus. */
export function leadingColumnsBreak(columns: SectionProps['columns']): JSONContent {
	return {
		type: SECTION_BREAK_NODE,
		attrs: { pageSetup: null, columns, continuous: true },
	}
}
