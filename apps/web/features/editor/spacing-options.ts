import type { BlockKeepValues } from './block-keep'

/** Prasetel spasi baris, mengikuti menu "Spasi baris & paragraf" Google Docs. */
export const LINE_SPACING_OPTIONS = [
	{ value: '1', label: 'Tunggal' },
	{ value: '1.15', label: '1.15' },
	{ value: '1.5', label: '1.5' },
	{ value: '2', label: 'Ganda' },
] as const

/** Spasi baris baku Google - dipakai saat atribut lineHeight belum diatur. */
export const DEFAULT_LINE_SPACING = '1.15'

/** Besar spasi (pt) yang diterapkan butir "Tambah spasi sebelum/sesudah paragraf". */
export const ADD_SPACE_PT = 12

/** Keempat saklar penanganan halaman beserta label menunya. */
export const KEEP_OPTIONS: ReadonlyArray<{ key: keyof BlockKeepValues; label: string }> = [
	{ key: 'keepWithNext', label: 'Tetap dengan berikutnya' },
	{ key: 'keepLines', label: 'Satukan baris' },
	{ key: 'widowControl', label: 'Cegah baris tunggal' },
	{ key: 'pageBreakBefore', label: 'Tambah hentian halaman sebelum' },
]
