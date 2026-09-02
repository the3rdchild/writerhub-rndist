/**
 * Bentuk tipografi dokumen: rupa huruf badan naskah dan gaya tiap tingkat
 * judul. Ia melengkapi `layout.ts` - kalau `PageSetup` menentukan sebesar apa
 * kertasnya, berkas ini menentukan sebesar apa hurufnya.
 *
 * Semua ukuran dalam **titik (pt)**: satuan yang sama dengan kotak ukuran font
 * di toolbar dan dengan `w:sz` di DOCX, jadi angka yang ditulis sebuah template
 * adalah angka yang dibaca pengguna dan angka yang diekspor. Editor menyimpan
 * atribut bloknya dalam px; konversinya cuma di satu tempat,
 * `apps/web/features/editor/spacing-units.ts`.
 *
 * `lineHeight` memakai satuan **spasi dokumen**, bukan `line-height` CSS: 1
 * berarti satu spasi, 1,5 berarti spasi satu setengah, seperti yang dimaksud
 * penyusun format skripsi dan seperti yang tersimpan di DOCX. CSS mengukurnya
 * lain, jadi kanvas mengalikannya dengan `LINE_SPACING_TO_CSS` - faktor yang
 * sama, arah sebaliknya, dengan yang sudah dipakai pembaca DOCX di
 * `apps/web/features/document/docx/units.ts`. Karena itu putar-baliknya
 * tertutup: 1,5 di template tetap 1,5 di berkas yang diekspor.
 *
 * Template hanya menuliskan yang ia pedulikan (`BlockStyleOverride`);
 * `resolveBlockStyle` yang melengkapinya menjadi `BlockStyle` utuh. Satu
 * penyelesai untuk semua pembaca - CSS di kanvas dan gaya di DOCX - supaya
 * layar dan berkas ekspor tidak bisa berbeda diam-diam.
 */

/** Daftar tingkatnya sendiri milik editor: `features/editor/heading-extension.ts`. */
export type HeadingLevel = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9

export type BlockAlign = 'left' | 'center' | 'right' | 'justify'

export interface FontChoice {
	/** Tumpukan CSS lengkap, persis seperti nilai di `font-catalog.ts`. */
	family: string
	sizePt: number
}

/**
 * Rupa satu blok naskah - dipakai paragraf badan maupun setiap tingkat judul.
 * Seluruh medannya wajib karena ini hasil resolusi, bukan yang ditulis
 * template.
 */
export interface BlockStyle {
	sizePt: number
	bold: boolean
	italic: boolean
	align: BlockAlign
	/** Indent seluruh blok dari margin kiri. */
	indentPt: number
	/** Indent baris pertama saja; negatif berarti menggantung (hanging). */
	firstLinePt: number
	spaceBeforePt: number
	spaceAfterPt: number
	lineHeight: number
}

/** Yang boleh ditulis sebuah template; sisanya diisi `resolveBlockStyle`. */
export type BlockStyleOverride = Partial<BlockStyle>

export interface DocumentTypography {
	baseFont: FontChoice
	/** Jarak baris badan naskah; menjadi bawaan blok yang tidak menyebutnya. */
	lineHeight: number
	paragraph?: BlockStyleOverride
	headings?: Partial<Record<HeadingLevel, BlockStyleOverride>>
}

export const DEFAULT_BASE_FONT_SIZE_PT = 11
export const DEFAULT_LINE_HEIGHT = 1.5

/** Spasi dokumen → `line-height` CSS. Kebalikan `WORD_LINE_TO_CSS` di `docx/units.ts`. */
export const LINE_SPACING_TO_CSS = 1.15

export function cssLineHeight(lineSpacing: number): number {
	return Math.round(lineSpacing * LINE_SPACING_TO_CSS * 100) / 100
}

/**
 * Tangga ukuran judul sebagai kelipatan ukuran badan, dipakai saat template
 * tidak menyebut tingkat itu. Angkanya sengaja sama dengan tangga `em` yang
 * dulu ditulis tangan di `globals.css`, supaya dokumen tanpa tipografi sendiri
 * tampil persis seperti sebelumnya.
 */
export const DEFAULT_HEADING_SCALE: Readonly<Record<HeadingLevel, number>> = {
	1: 1.9,
	2: 1.5,
	3: 1.22,
	4: 1.12,
	5: 1.05,
	6: 1,
	7: 0.95,
	8: 0.9,
	9: 0.87,
}

/** Jarak judul ke naskah di atas dan di bawahnya, sebagai kelipatan ukurannya sendiri. */
const HEADING_SPACE_BEFORE_EM = 1.4
const HEADING_SPACE_AFTER_EM = 0.4
const HEADING_LINE_HEIGHT = 1.08

/** Jarak antar paragraf badan, sebagai kelipatan ukuran badan. */
const PARAGRAPH_SPACE_BEFORE_EM = 0.75

const round = (value: number) => Math.round(value * 100) / 100

function baseStyle(typography: DocumentTypography): BlockStyle {
	return {
		sizePt: typography.baseFont.sizePt,
		bold: false,
		italic: false,
		align: 'left',
		indentPt: 0,
		firstLinePt: 0,
		spaceBeforePt: 0,
		spaceAfterPt: 0,
		lineHeight: typography.lineHeight,
	}
}

/**
 * Gaya paragraf badan: bawaan dokumen, ditimpa apa pun yang ditulis template.
 */
export function resolveParagraphStyle(typography: DocumentTypography): BlockStyle {
	return {
		...baseStyle(typography),
		spaceBeforePt: round(typography.baseFont.sizePt * PARAGRAPH_SPACE_BEFORE_EM),
		...typography.paragraph,
	}
}

/**
 * Gaya satu tingkat judul. Tanpa penimpa dari template ia jatuh ke tangga
 * bawaan - tebal, rata kiri, dan sebesar kelipatan `DEFAULT_HEADING_SCALE`.
 */
export function resolveHeadingStyle(typography: DocumentTypography, level: HeadingLevel): BlockStyle {
	const override = typography.headings?.[level]
	const sizePt = override?.sizePt ?? round(typography.baseFont.sizePt * DEFAULT_HEADING_SCALE[level])

	return {
		...baseStyle(typography),
		sizePt,
		bold: true,
		lineHeight: HEADING_LINE_HEIGHT,
		spaceBeforePt: round(sizePt * HEADING_SPACE_BEFORE_EM),
		spaceAfterPt: round(sizePt * HEADING_SPACE_AFTER_EM),
		...override,
	}
}
