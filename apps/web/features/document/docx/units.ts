import { webfontFamily } from '@/features/editor/font-catalog'

/**
 * Satuan Word diterjemahkan ke satuan editor, di satu tempat.
 *
 * Dikumpulkan di sini supaya pembulatannya tidak tersebar - dan supaya angka
 * yang dipakai membaca sama persis dengan yang dipakai menulis. Ekspor sudah
 * memakai 15 twip per piksel; kalau impor memilih angka lain, dokumen akan
 * bergeser sedikit tiap kali ia bolak-balik antara editor dan Word.
 */

/** Twip - satuan panjang Word. 1 inci = 1440 twip; layar kita 96 px per inci. */
export const TWIPS_PER_PX = 15

export function twipsToPx(twips: number): number {
	return Math.round(twips / TWIPS_PER_PX)
}

/**
 * EMU - satuan gambar OOXML. 914.400 EMU per inci, jadi 9525 EMU per piksel
 * di 96 dpi. `wp:extent` menyimpan ukuran tampilan gambar dalam EMU - bukan
 * ukuran asli pikselnya, yang pada gambar ber-resolusi tinggi bisa beberapa
 * kali lipat lebih besar. Memakai ukuran asli membuat gambar tampak mengerikan
 * besarnya; memakai extent membuatnya tampil seperti di Word.
 */
const EMU_PER_PX = 9525

export function emuToPx(emu: number): number {
	return Math.round(emu / EMU_PER_PX)
}

/** `w:sz` menyimpan ukuran huruf dalam setengah poin. */
export function halfPointsToPt(halfPoints: number): number {
	return Math.round((halfPoints / 2) * 10) / 10
}

/**
 * Warna run jadi warna CSS.
 *
 * 'auto' berarti "biar Word yang memutuskan", yang di layar berarti warna teks
 * biasa. Menuliskannya sebagai warna eksplisit justru merusak mode gelap:
 * teksnya akan terkunci hitam di atas latar gelap.
 */
export function toCssColor(value: string | undefined): string | undefined {
	if (!value || value.toLowerCase() === 'auto') return undefined
	return /^[0-9a-f]{6}$/i.test(value) ? `#${value.toLowerCase()}` : value
}

/** Nama sorotan Word; nilainya kata, bukan angka. */
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
	return HIGHLIGHTS[value] ?? undefined
}

/**
 * Kelipatan spasi Word diukur terhadap tinggi baris alami fontnya, sedangkan
 * kelipatan CSS diukur terhadap ukuran hurufnya - dan keduanya tidak sama.
 *
 * Tinggi baris alami Times New Roman kira-kira 1,15 kali ukuran hurufnya, dan
 * font naskah lain berada di sekitar angka itu juga. Tanpa faktor ini, "spasi
 * 1,5" Word datang ke editor sekitar 15% lebih rapat daripada aslinya - selisih
 * yang menumpuk jadi beda satu halaman penuh pada naskah sepanjang skripsi.
 */
const WORD_LINE_TO_CSS = 1.15

/**
 * Spasi baris Word jadi nilai `line-height` CSS.
 *
 * Word punya tiga aturan yang bentuknya berbeda: `auto` menyimpan kelipatan
 * baris dalam 240-an - 360 berarti 1,5 - sedangkan `exact` dan `atLeast`
 * menyimpan tinggi sebenarnya dalam twip. Keduanya tidak bisa dipetakan dengan
 * rumus yang sama.
 *
 * Paragraf yang tidak menyebut apa pun berspasi tunggal di Word, dan itu persis
 * arti `normal` di CSS: tinggi baris bawaan fontnya. Menyebutkannya - alih-alih
 * membiarkannya kosong - penting, karena editor memasang spasinya sendiri yang
 * jauh lebih longgar.
 */
export function toLineHeight(line: number | undefined, rule: string | undefined): string {
	if (line === undefined || line <= 0) return 'normal'

	if (rule === 'exact' || rule === 'atLeast') return `${twipsToPx(line)}px`

	const multiple = line / 240
	if (multiple === 1) return 'normal'
	return String(Math.round(multiple * WORD_LINE_TO_CSS * 100) / 100)
}

/**
 * Nama font Word jadi tumpukan font CSS.
 *
 * Cadangan generiknya ditebak dari nama: tanpa itu, font yang tidak terpasang
 * di mesin pembaca jatuh ke font bawaan peramban - biasanya sans-serif - dan
 * naskah berhuruf Times mendadak berganti rupa sama sekali.
 */
export function toFontStack(font: string | undefined): string | undefined {
	if (!font) return undefined

	// Huruf yang berkasnya kita sajikan sendiri disebut lewat variabelnya, bukan
	// namanya - alasannya di `font-catalog.ts`.
	const loaded = webfontFamily(font)
	if (loaded) return loaded

	const quoted = /\s/.test(font) ? `"${font}"` : font
	if (/mono|consol|courier|code/i.test(font)) return `${quoted}, monospace`
	if (/times|georgia|garamond|book|serif|cambria|minion/i.test(font)) return `${quoted}, serif`
	return `${quoted}, sans-serif`
}
