import { type DocumentTypography, resolveHeadingStyle } from '@writer-hub/shared'
import { fontFamilyLabel } from '@/features/editor/font-catalog'
import { DOCX_ALIGNMENT } from './docx/typography-styles'

/**
 * Gaya paragraf tambahan yang dirujuk pengekspor DOCX, di luar Heading 1-6
 * milik `docxTypographyStyles`.
 */

const pt = (value: number) => Math.round(value * 20)

/**
 * Caption (judul tingkat 7-9) → gaya bawaan Word "heading 7..9".
 *
 * Dulu tingkat 7-9 ditulis sebagai Heading 6 + outline, jadi caption "Gambar 1"
 * ikut masuk daftar isi Word yang mencakup tingkat 6 dan tampil sebagai judul
 * di panel Navigasi (OBJ-21). Dengan gaya sendiri, daftar isi `\o "1-3"` tidak
 * menyentuhnya, daftar gambar/tabel bisa merujuknya lewat `\t`, dan importer
 * tetap membacanya kembali sebagai tingkat 7-9 dari outline-nya.
 */
export function captionParagraphStyles(typography: DocumentTypography | null | undefined) {
	return ([7, 8, 9] as const).map((level) => {
		const style = typography ? resolveHeadingStyle(typography, level) : null
		return {
			id: `Heading${level}`,
			name: `heading ${level}`,
			basedOn: 'Normal',
			next: 'Normal',
			quickFormat: true,
			run: style
				? {
						font: fontFamilyLabel(typography?.baseFont.family ?? ''),
						size: Math.round(style.sizePt * 2),
						bold: style.bold,
						italics: style.italic,
						color: '000000',
					}
				: { bold: true },
			paragraph: {
				outlineLevel: level - 1,
				...(style
					? {
							alignment: DOCX_ALIGNMENT[style.align] ?? 'left',
							spacing: {
								before: pt(style.spaceBeforePt),
								after: pt(style.spaceAfterPt),
								line: Math.round(style.lineHeight * 240),
								lineRule: 'auto' as const,
							},
							indent: {
								left: pt(style.indentPt),
								firstLine: Math.max(0, pt(style.firstLinePt)),
								hanging: Math.max(0, pt(-style.firstLinePt)),
							},
						}
					: {}),
			},
		}
	})
}

/** Warna teks kutipan di kanvas (`--foreground-muted`). */
export const QUOTE_COLOR = '4B5563'

/**
 * Gaya "Quote" untuk kutipan - label semantik bagi pengguna Word. Rupa
 * lengkapnya (lekukan dan garis kiri) ditulis langsung di paragrafnya, karena
 * kutipan bisa memuat daftar dan tabel yang lekukannya bertumpuk.
 */
export const QUOTE_PARAGRAPH_STYLE = {
	id: 'Quote',
	name: 'Quote',
	basedOn: 'Normal',
	next: 'Normal',
	quickFormat: true,
	run: { italics: true, color: QUOTE_COLOR },
}
