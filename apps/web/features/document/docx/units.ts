import { cssLineHeight } from '@writer-hub/shared'
import { webfontFamily } from '@/features/editor/font-catalog'
export const TWIPS_PER_PX = 15

export function twipsToPx(twips: number): number {
	return Math.round(twips / TWIPS_PER_PX)
}

const EMU_PER_PX = 9525

export function emuToPx(emu: number): number {
	return Math.round(emu / EMU_PER_PX)
}

export function halfPointsToPt(halfPoints: number): number {
	return Math.round((halfPoints / 2) * 10) / 10
}

export function toCssColor(value: string | undefined): string | undefined {
	if (!value || value.toLowerCase() === 'auto') return undefined
	return /^[0-9a-f]{6}$/i.test(value) ? `#${value.toLowerCase()}` : value
}

const HIGHLIGHTS: Record<string, string> = {
	yellow: '#ffff00',
	green: '#00ff00',
	cyan: '#00ffff',
	magenta: '#ff00ff',
	blue: '#0000ff',
	red: '#ff0000',
	darkBlue: '#000080',
	darkCyan: '#008080',
	darkGreen: '#008000',
	darkMagenta: '#800080',
	darkRed: '#800000',
	darkYellow: '#808000',
	darkGray: '#808080',
	lightGray: '#c0c0c0',
	black: '#000000',
	white: '#ffffff',
}

export function highlightColor(value: string | undefined): string | undefined {
	if (!value) return undefined
	// Nama warna Word dikenali; nilai hex langsung dipakai apa adanya supaya
	// sorotan kustom tidak lenyap diam-diam.
	if (/^[0-9a-f]{6}$/i.test(value)) return `#${value.toLowerCase()}`
	return HIGHLIGHTS[value] ?? undefined
}

/**
 * `w:line` → `line-height` CSS.
 *
 * Satuannya sama dengan yang dipakai tipografi dokumen: 1 berarti spasi
 * tunggal, dan `cssLineHeight` yang mengubahnya ke ukuran CSS. Satu sumber
 * angka untuk keduanya - kalau importer memakai faktor sendiri, dokumen hasil
 * impor dan dokumen buatan editor akan berselisih tinggi baris diam-diam.
 *
 * Spasi tunggal **tidak** boleh menjadi `normal`. `normal` menyerahkan tinggi
 * baris kepada metrik font yang kebetulan merender: Source Serif 4 - font
 * bawaan kanvas - menghitung 1,371, sementara Word menghitung ~1,15 untuk font
 * temanya. Selisih 15% per baris cukup untuk membuat halaman sampul yang di
 * Word memenuhi satu lembar meluber ke lembar kedua.
 */
export function toLineHeight(line: number | undefined, rule: string | undefined): string {
	// Tanpa keterangan apa pun, Word memakai spasi tunggal.
	if (line === undefined || line <= 0) return String(cssLineHeight(1))

	if (rule === 'exact' || rule === 'atLeast') return `${twipsToPx(line)}px`

	return String(cssLineHeight(line / 240))
}

export function toFontStack(font: string | undefined): string | undefined {
	if (!font) return undefined
	const loaded = webfontFamily(font)
	if (loaded) return loaded

	const quoted = /\s/.test(font) ? `"${font}"` : font
	if (/mono|consol|courier|code/i.test(font)) return `${quoted}, monospace`
	if (/times|georgia|garamond|book|serif|cambria|minion/i.test(font)) return `${quoted}, serif`
	return `${quoted}, sans-serif`
}
