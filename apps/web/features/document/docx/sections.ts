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
import { SECTION_BREAK_NODE, type SectionColumns } from '@/features/editor/section-break'
import { twipsToPx } from './units'
import { attr, child, children, val } from './xml'

export type PageSetupPatch = Partial<Omit<PageSetup, 'margins'>> & { margins?: Partial<PageMargins> }

export interface SectionProps {
	pageSetup: PageSetupPatch
	columns: SectionColumns | null
	continuous?: boolean
	/**
	 * Format yang benar-benar TERTULIS di `w:pgNumType/@w:fmt` section ini.
	 * Kosong berarti section ini tidak menyebut format sama sekali - dan di
	 * Word itu berarti "pakai punya section sebelumnya", bukan "desimal".
	 */
	declaredNumberFormat?: PageNumberFormat
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

function numberingOf(sectPr: Element): { numbering: PageNumbering; format?: PageNumberFormat } | undefined {
	const pgNumType = child(sectPr, 'pgNumType')
	if (!pgNumType) return undefined

	const format = PGNUM_FORMATS[attr(pgNumType, 'fmt') ?? '']
	const start = Number.parseInt(attr(pgNumType, 'start') ?? '', 10)
	/* Word: tanpa start, penomoran melanjutkan section sebelumnya. */
	const restart: PageNumbering['restart'] = Number.isFinite(start) && start >= 0 ? start : 'continue'
	return { numbering: { format: format ?? 'decimal', restart }, ...(format ? { format } : {}) }
}

/**
 * Penomoran tiap section dinyatakan EKSPLISIT, termasuk yang diam.
 *
 * Di Word `w:pgNumType` yang absen berarti "lanjutkan", tapi atribut section
 * break di editor ini diwariskan lewat `{ ...previous.setup, ...patch }`: patch
 * yang diam soal penomoran membiarkan `restart` milik section PERTAMA hidup di
 * setiap section sesudahnya, dan dokumen yang mulai di halaman 32 mengulang
 * 32 di tiap section. Menuliskan `restart: 'continue'` apa adanya menutup
 * jalan itu - importer harus bisa membedakan "tidak disebut" dari "dinyatakan
 * nihil", dan jawabannya menulis eksplisit.
 *
 * Formatnya ikut dirantai di sini karena ia mewaris ke arah yang berlawanan:
 * section yang tidak menyebut `w:fmt` memakai format section sebelumnya, jadi
 * 'decimal' bukan nilai jatuhan yang benar untuk dokumen beromawi.
 */
export function carryPageNumbering(sections: readonly SectionProps[]): void {
	let format: PageNumberFormat = 'decimal'
	for (const props of sections) {
		format = props.declaredNumberFormat ?? format
		props.pageSetup.pageNumbering = {
			format,
			restart: props.pageSetup.pageNumbering?.restart ?? 'continue',
		}
	}
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

/**
 * `w:cols` → tata letak kolom.
 *
 * Kolom tak-sama (`w:equalWidth="0"`) menyatakan lebarnya lewat anak `w:col`,
 * dan jaraknya ikut pindah ke sana: templat semacam itu hampir tidak pernah
 * memakai `w:cols/@w:space`, jadi membaca atribut tingkat `w:cols` saja
 * membuang lebar DAN jaraknya sekaligus. Jumlah `w:col` yang tidak cocok
 * dengan `w:num` diabaikan - `w:num` yang dipercaya, sisanya jatuh ke kolom
 * sama lebar.
 */
function readColumns(cols: Element | null): SectionProps['columns'] {
	const count = Number.parseInt(attr(cols, 'num') ?? '', 10)
	if (!cols || !Number.isFinite(count) || count < 2) return null

	const columns: SectionColumns = { count }
	const space = Number.parseInt(attr(cols, 'space') ?? '', 10)
	if (Number.isFinite(space)) columns.gap = twipsToPx(space)

	const entries = children(cols, 'col')
	if (entries.length !== count) return columns

	const widths = entries.map((col) => twipsToPx(Number.parseInt(attr(col, 'w') ?? '', 10)))
	if (widths.every((width) => width > 0)) columns.widths = widths

	/* `w:space` milik kolom TERAKHIR tidak punya celah di kanannya. */
	const gaps = entries.slice(0, -1).map((col) => twipsToPx(Number.parseInt(attr(col, 'space') ?? '', 10)))
	if (gaps.every((gap) => Number.isFinite(gap) && gap >= 0)) {
		columns.gaps = gaps
		if (columns.gap === undefined) columns.gap = gaps[0]
	}

	return columns
}

export function readSectPr(sectPr: Element): SectionProps {
	const pageSetup: PageSetupPatch = {}

	const numbering = numberingOf(sectPr)
	if (numbering) pageSetup.pageNumbering = numbering.numbering

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

	const columns = readColumns(child(sectPr, 'cols'))

	return {
		pageSetup,
		columns,
		...(numbering?.format ? { declaredNumberFormat: numbering.format } : {}),
		...(val(child(sectPr, 'type')) === 'continuous' ? { continuous: true } : {}),
	}
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
