/**
 * Gaya paragraf tambahan yang dirujuk pengekspor DOCX, di luar Heading 1-6
 * milik `docxTypographyStyles`.
 */

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
