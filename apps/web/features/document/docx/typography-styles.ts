/**
 * Menerjemahkan `DocumentTypography` menjadi bagian `styles` sebuah DOCX:
 * `docDefaults` untuk badan naskah, plus gaya Heading 1-6.
 *
 * Tanpa ini Word memakai gaya judul bawaannya sendiri - biru, Calibri Light,
 * dan membesar - sehingga skripsi yang di kanvas sudah benar 12pt tebal rata
 * tengah berubah rupa begitu berkasnya dibuka. Sumber angkanya sama persis
 * dengan yang dipakai kanvas (`resolveHeadingStyle`), jadi layar dan berkas
 * tidak bisa berbeda diam-diam.
 */

import {
	type BlockStyle,
	type DocumentTypography,
	type HeadingLevel,
	resolveHeadingStyle,
	resolveParagraphStyle,
} from '@writer-hub/shared'
import { fontFamilyLabel } from '@/features/editor/font-catalog'

/** Word menyimpan ukuran huruf dalam setengah titik, dan jarak dalam twip. */
const HALF_POINTS_PER_PT = 2
const TWIPS_PER_PT = 20

/** Satu spasi penuh bernilai 240 pada `w:line`. */
const TWENTIETHS_PER_LINE = 240

/** Nama perataan CSS → nama milik Word. */
export const DOCX_ALIGNMENT: Record<string, 'left' | 'center' | 'right' | 'both'> = {
	left: 'left',
	center: 'center',
	right: 'right',
	justify: 'both',
}

/** Judul DOCX hanya sampai tingkat 6; 7-9 diekspor sebagai Heading 6 + outline. */
const DOCX_HEADING_LEVELS: readonly HeadingLevel[] = [1, 2, 3, 4, 5, 6]

const pt = (value: number) => Math.round(value * TWIPS_PER_PT)

function runOf(style: BlockStyle, family: string) {
	return {
		font: fontFamilyLabel(family),
		size: Math.round(style.sizePt * HALF_POINTS_PER_PT),
		bold: style.bold,
		italics: style.italic,
		// Judul bawaan Word berwarna biru; tanpa warna eksplisit ia menang.
		color: '000000',
	}
}

function paragraphOf(style: BlockStyle) {
	return {
		alignment: DOCX_ALIGNMENT[style.align] ?? 'left',
		// Aturan tingkat judul, bukan atribut per blok: ia ikut gaya Heading-nya
		// jadi bab yang ditambahkan di dalam Word pun tetap membuka lembar baru.
		...(style.pageBreakBefore ? { pageBreakBefore: true } : {}),
		spacing: {
			before: pt(style.spaceBeforePt),
			after: pt(style.spaceAfterPt),
			line: Math.round(style.lineHeight * TWENTIETHS_PER_LINE),
			lineRule: 'auto' as const,
		},
		indent: {
			left: pt(style.indentPt),
			firstLine: Math.max(0, pt(style.firstLinePt)),
			hanging: Math.max(0, pt(-style.firstLinePt)),
		},
	}
}

/**
 * Bentuk `styles` untuk konstruktor `Document`. Dikembalikan sebagai objek
 * biasa - pustaka `docx` menerimanya apa adanya, jadi berkas ini tidak perlu
 * ikut menunggu `import('docx')` yang malas itu.
 */
export function docxTypographyStyles(typography: DocumentTypography) {
	const family = typography.baseFont.family
	const body = resolveParagraphStyle(typography)

	const headings = Object.fromEntries(
		DOCX_HEADING_LEVELS.map((level) => {
			const style = resolveHeadingStyle(typography, level)
			return [`heading${level}`, { run: runOf(style, family), paragraph: paragraphOf(style) }]
		}),
	)

	return {
		default: {
			document: { run: runOf(body, family), paragraph: paragraphOf(body) },
			...headings,
		},
	}
}
