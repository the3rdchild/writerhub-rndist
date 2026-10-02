import type { TocListKind } from './toc-block'

/**
 * Jenis caption dari awal teksnya. Caption hidup sebagai judul tingkat 7-9;
 * gambar dan tabel hanya dibedakan oleh kata pembukanya ("Gambar 1.2",
 * "Table 3"). Dipakai impor DOCX (jenis field TOC) dan daftar gambar/tabel di
 * kanvas - dulu hanya impor yang membedakannya, sehingga daftar gambar dan
 * daftar tabel di kanvas berisi campuran keduanya (uji editor 2 Okt, OBJ-8).
 */
export const FIGURE_CAPTION = /^\s*(?:gambar|figure|fig\.|gbr\.?)/i
export const TABLE_CAPTION = /^\s*(?:tabel|table|tbl\.)/i

/** Tingkat judul tempat caption hidup. */
export const CAPTION_MIN_LEVEL = 7
export const CAPTION_MAX_LEVEL = 9

export function captionKind(text: string): Exclude<TocListKind, 'isi'> | null {
	if (FIGURE_CAPTION.test(text)) return 'gambar'
	if (TABLE_CAPTION.test(text)) return 'tabel'
	return null
}
