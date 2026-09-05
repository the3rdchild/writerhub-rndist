import { cssLineHeight, DEFAULT_LINE_HEIGHT } from '@writer-hub/shared'
import type { BlockKeepValues } from './block-keep'

/**
 * Prasetel spasi baris, mengikuti menu "Spasi baris & paragraf" Google Docs.
 *
 * `spacing` adalah **spasi dokumen** - 1 berarti tunggal, seperti yang dimaksud
 * penyusun format skripsi dan seperti yang tersimpan di DOCX. `value` adalah
 * `line-height` CSS yang benar-benar ditulis ke atribut blok, dan jalannya
 * harus lewat `cssLineHeight` yang sama dengan importer DOCX serta lembar gaya
 * tipografi. Dulu menu menulis angkanya mentah-mentah, sehingga "Tunggal"
 * berarti `line-height: 1` - lebih rapat daripada tunggal versi Word - dan
 * naskah hasil impor tidak pernah cocok dengan satu prasetel pun.
 */
export const LINE_SPACING_OPTIONS = [
	{ spacing: 1, value: String(cssLineHeight(1)), label: 'Tunggal' },
	{ spacing: 1.15, value: String(cssLineHeight(1.15)), label: '1.15' },
	{ spacing: 1.5, value: String(cssLineHeight(1.5)), label: '1.5' },
	{ spacing: 2, value: String(cssLineHeight(2)), label: 'Ganda' },
] as const

/**
 * Spasi yang berlaku saat blok belum menyatakan miliknya sendiri **dan**
 * dokumennya tidak membawa tipografi - dokumen kosong. Diturunkan, bukan
 * ditulis tangan: angka yang tampil di menu harus angka yang dirender.
 */
export const DEFAULT_LINE_SPACING = String(cssLineHeight(DEFAULT_LINE_HEIGHT))

/** Besar spasi (pt) yang diterapkan butir "Tambah spasi sebelum/sesudah paragraf". */
export const ADD_SPACE_PT = 12

/** Keempat saklar penanganan halaman beserta label menunya. */
export const KEEP_OPTIONS: ReadonlyArray<{ key: keyof BlockKeepValues; label: string }> = [
	{ key: 'keepWithNext', label: 'Tetap dengan berikutnya' },
	{ key: 'keepLines', label: 'Satukan baris' },
	{ key: 'widowControl', label: 'Cegah baris tunggal' },
	{ key: 'pageBreakBefore', label: 'Tambah hentian halaman sebelum' },
]
