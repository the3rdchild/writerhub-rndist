import { FONT_FAMILIES } from '@/features/editor/font-catalog'

/**
 * Mark ProseMirror → properti run Word (`w:rPr`).
 *
 * Dulu pengekspor hanya mengenal tebal, miring, garis bawah, dan coret, jadi
 * jenis huruf, ukuran, warna, sorotan, sub/superskrip, kode, dan tautan lenyap
 * dari berkas Word walau tampil di kanvas dan PDF (TKS-4, OBJ-20). Semua yang
 * di sini murni - tanpa pustaka `docx` - supaya bisa diuji sendiri dan dipakai
 * ulang oleh perabot halaman.
 */

/** Huruf lebar-tetap untuk kode di Word; ada di Windows maupun Office Mac. */
export const CODE_FONT = 'Consolas'

/**
 * Latar kode dalam baris: `--overlay-hover` (rgba(15,23,42,.04)) di atas kertas
 * putih - warna yang sama dengan yang tampil di kanvas dan PDF.
 */
export const CODE_SHADING = 'F5F6F7'

/** Warna sorotan bawaan Word (`w:highlight`) beserta nilai RGB-nya. */
const WORD_HIGHLIGHTS = [
	['yellow', 'FFFF00'],
	['green', '00FF00'],
	['cyan', '00FFFF'],
	['magenta', 'FF00FF'],
	['blue', '0000FF'],
	['red', 'FF0000'],
	['darkBlue', '000080'],
	['darkCyan', '008080'],
	['darkGreen', '008000'],
	['darkMagenta', '800080'],
	['darkRed', '800000'],
	['darkYellow', '808000'],
	['darkGray', '808080'],
	['lightGray', 'C0C0C0'],
	['black', '000000'],
	['white', 'FFFFFF'],
] as const

export type WordHighlight = (typeof WORD_HIGHLIGHTS)[number][0]

/** Nama warna CSS yang lazim muncul di tempelan; selebihnya dianggap tak terbaca. */
const NAMED_COLORS: Record<string, string> = {
	black: '000000',
	white: 'FFFFFF',
	red: 'FF0000',
	green: '008000',
	lime: '00FF00',
	blue: '0000FF',
	yellow: 'FFFF00',
	cyan: '00FFFF',
	aqua: '00FFFF',
	magenta: 'FF00FF',
	fuchsia: 'FF00FF',
	gray: '808080',
	grey: '808080',
	silver: 'C0C0C0',
	maroon: '800000',
	olive: '808000',
	navy: '000080',
	purple: '800080',
	teal: '008080',
	orange: 'FFA500',
	pink: 'FFC0CB',
	brown: 'A52A2A',
	gold: 'FFD700',
	darkgray: 'A9A9A9',
	darkgrey: 'A9A9A9',
	lightgray: 'D3D3D3',
	lightgrey: 'D3D3D3',
	darkred: '8B0000',
	darkblue: '00008B',
	darkgreen: '006400',
}

const hex2 = (value: number) =>
	Math.max(0, Math.min(255, Math.round(value)))
		.toString(16)
		.padStart(2, '0')
		.toUpperCase()

/** Komponen warna dengan alfa ditumpuk di atas kertas putih - Word tidak mengenal alfa. */
const overWhite = (channel: number, alpha: number) => channel * alpha + 255 * (1 - alpha)

function channelOf(part: string): number {
	const value = part.trim()
	if (value.endsWith('%')) return (Number.parseFloat(value) / 100) * 255
	return Number.parseFloat(value)
}

function alphaOf(part: string | undefined): number {
	if (part === undefined) return 1
	const value = part.trim()
	const parsed = value.endsWith('%') ? Number.parseFloat(value) / 100 : Number.parseFloat(value)
	return Number.isFinite(parsed) ? Math.max(0, Math.min(1, parsed)) : 1
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
	const hue = (((h % 360) + 360) % 360) / 360
	if (s === 0) return [l * 255, l * 255, l * 255]
	const q = l < 0.5 ? l * (1 + s) : l + s - l * s
	const p = 2 * l - q
	const channel = (t: number) => {
		const x = t < 0 ? t + 1 : t > 1 ? t - 1 : t
		if (x < 1 / 6) return p + (q - p) * 6 * x
		if (x < 1 / 2) return q
		if (x < 2 / 3) return p + (q - p) * (2 / 3 - x) * 6
		return p
	}
	return [channel(hue + 1 / 3) * 255, channel(hue) * 255, channel(hue - 1 / 3) * 255]
}

/**
 * Warna CSS → hex enam digit tanpa `#` (huruf besar), seperti yang diminta
 * `w:color`/`w:shd`. Warna tembus pandang ditumpuk di atas putih; `transparent`,
 * `var(...)`, dan nilai yang tidak terbaca menjadi `null`.
 */
export function cssColorToHex(value: unknown): string | null {
	if (typeof value !== 'string') return null
	const color = value.trim().toLowerCase()
	if (!color || color === 'transparent' || color === 'inherit' || color.startsWith('var(')) return null

	const hex = /^#?([0-9a-f]{3,8})$/.exec(color)?.[1]
	if (hex && (color.startsWith('#') || hex.length === 6)) {
		if (hex.length === 3 || hex.length === 4) {
			const [r, g, b, a] = [...hex].map((digit) => Number.parseInt(digit + digit, 16))
			const alpha = a === undefined ? 1 : a / 255
			if (alpha === 0) return null
			return hex2(overWhite(r, alpha)) + hex2(overWhite(g, alpha)) + hex2(overWhite(b, alpha))
		}
		if (hex.length === 6 || hex.length === 8) {
			const [r, g, b] = [0, 2, 4].map((at) => Number.parseInt(hex.slice(at, at + 2), 16))
			const alpha = hex.length === 8 ? Number.parseInt(hex.slice(6, 8), 16) / 255 : 1
			if (alpha === 0) return null
			return hex2(overWhite(r, alpha)) + hex2(overWhite(g, alpha)) + hex2(overWhite(b, alpha))
		}
		return null
	}

	const fn = /^(rgba?|hsla?)\((.*)\)$/.exec(color)
	if (fn) {
		const parts = fn[2].split(/[\s,/]+/).filter(Boolean)
		if (parts.length < 3) return null
		const alpha = alphaOf(parts[3])
		if (alpha === 0) return null
		const [r, g, b] = fn[1].startsWith('rgb')
			? parts.slice(0, 3).map(channelOf)
			: hslToRgb(
					Number.parseFloat(parts[0]),
					Number.parseFloat(parts[1]) / 100,
					Number.parseFloat(parts[2]) / 100,
				)
		if (![r, g, b].every(Number.isFinite)) return null
		return hex2(overWhite(r, alpha)) + hex2(overWhite(g, alpha)) + hex2(overWhite(b, alpha))
	}

	return NAMED_COLORS[color] ?? null
}

/**
 * Nama `w:highlight` untuk warna yang memang salah satu dari 16 warna sorotan
 * Word (mis. dari dokumen Word yang diimpor), atau `null`.
 *
 * Warna lain sengaja TIDAK dibulatkan ke yang terdekat: kuning pastel kanvas
 * (#fef08a) akan berubah jadi kuning stabilo. Ia ditulis sebagai arsiran
 * `w:shd` dengan warna persisnya - cara yang sama dengan ekspor Google Docs.
 */
export function wordHighlightOf(hex: string): WordHighlight | null {
	const target = [0, 2, 4].map((at) => Number.parseInt(hex.slice(at, at + 2), 16))
	for (const [name, value] of WORD_HIGHLIGHTS) {
		const rgb = [0, 2, 4].map((at) => Number.parseInt(value.slice(at, at + 2), 16))
		if (rgb.every((channel, index) => Math.abs(channel - (target[index] ?? -999)) <= 8)) return name
	}
	return null
}

const GENERIC_FAMILIES = new Set([
	'serif',
	'sans-serif',
	'monospace',
	'cursive',
	'fantasy',
	'system-ui',
	'ui-serif',
	'ui-sans-serif',
	'ui-monospace',
	'ui-rounded',
	'math',
	'emoji',
	'inherit',
	'initial',
])

/**
 * Tumpukan `font-family` CSS → satu nama huruf Word.
 *
 * Huruf dari katalog memakai labelnya (webfont tersimpan sebagai
 * `var(--font-lato), sans-serif`, dan Word mengenalnya sebagai "Lato"); di luar
 * katalog, nama pertama yang bukan keluarga generik. Tumpukan yang isinya
 * generik semua tidak menamai huruf apa pun: run-nya mengikuti huruf dokumen.
 */
export function fontNameOf(family: unknown): string | null {
	if (typeof family !== 'string' || !family.trim()) return null
	const known = FONT_FAMILIES.find((font) => font.value === family)
	if (known) return known.label

	for (const raw of family.split(',')) {
		const name = raw.trim().replace(/^["']|["']$/g, '')
		if (!name || name.startsWith('var(') || GENERIC_FAMILIES.has(name.toLowerCase())) continue
		return name
	}
	return null
}

/**
 * Ukuran huruf CSS → setengah titik (`w:sz`). Toolbar menulis `"18pt"`;
 * tempelan bisa membawa px, em, atau persen - dua yang terakhir dihitung dari
 * ukuran badan naskah.
 */
export function fontSizeHalfPoints(size: unknown, basePt = 11): number | null {
	if (typeof size !== 'string' && typeof size !== 'number') return null
	const text = String(size).trim().toLowerCase()
	const value = Number.parseFloat(text)
	if (!Number.isFinite(value) || value <= 0) return null

	let pt: number
	if (text.endsWith('pt')) pt = value
	else if (text.endsWith('px')) pt = value * 0.75
	else if (text.endsWith('rem') || text.endsWith('em')) pt = value * basePt
	else if (text.endsWith('%')) pt = (value / 100) * basePt
	else pt = value
	return Math.max(2, Math.round(pt * 2))
}

/** Skema yang aman dan berarti di luar aplikasi. */
const SAFE_SCHEME = /^(https?|mailto|tel|ftp|ftps|sms):/i

/**
 * Nama domain tanpa skema (`contoh.co.id/x`). Akhirannya dibatasi ke TLD yang
 * lazim supaya nama berkas relatif seperti `laporan.pdf` tidak ikut dianggap
 * situs web.
 */
const BARE_DOMAIN =
	/^[\w-]+(\.[\w-]+)*\.(com|org|net|id|edu|gov|io|dev|app|info|biz|me|co|ac|go|or|sch|my|sg|uk|us|au|de|nl|fr|jp|cn|in|ai|ly|tv)(:\d+)?([/?#].*)?$/i

/**
 * Alamat tautan untuk hyperlink eksternal Word, atau `null` bila tidak layak.
 *
 * Tautan tanpa skema yang berbentuk nama domain (`contoh.com/x`, `www.x.id`)
 * diberi `https://` - di Word alamat relatif dibaca relatif terhadap letak
 * berkas, jadi pasti mati. Jangkar `#...`, jalur relatif, dan skema yang bisa
 * menjalankan kode (`javascript:`) tidak menjadi hyperlink.
 */
export function externalLinkOf(href: unknown): string | null {
	if (typeof href !== 'string') return null
	const value = href.trim()
	if (!value || value.startsWith('#') || value.startsWith('/')) return null
	if (SAFE_SCHEME.test(value)) return value
	// Skema lain (`javascript:`, `data:`, `file:`) - tapi bukan nomor port.
	if (/^[a-z][a-z0-9+.-]*:(?!\d)/i.test(value)) return null
	if (/^www\./i.test(value) || BARE_DOMAIN.test(value)) return `https://${value}`
	return null
}

/**
 * Bentuk minimal sebuah mark: `Mark` ProseMirror memenuhinya, dan mark JSON
 * (isi perabot halaman) cukup dibungkus `{ type: { name }, attrs }`.
 */
export interface MarkLike {
	type: { name: string }
	attrs: Record<string, unknown>
}

/** Mark JSON (`{ type: 'bold' }`) → bentuk minimal di atas. */
export function marksFromJson(
	marks: ReadonlyArray<{ type: string; attrs?: Record<string, unknown> }> = [],
): MarkLike[] {
	return marks.map((mark) => ({ type: { name: mark.type }, attrs: mark.attrs ?? {} }))
}

/** Properti run hasil mark - bentuk yang diterima `new TextRun(...)`. */
export interface RunStyle {
	bold?: boolean
	italics?: boolean
	underline?: Record<string, never>
	strike?: boolean
	color?: string
	size?: number
	font?: string
	highlight?: WordHighlight
	/** Selalu `false`: tanpa ini pustaka docx menulis `w:highlightCs`, elemen yang tidak ada di skema. */
	highlightComplexScript?: false
	shading?: { type: 'clear'; fill: string; color: 'auto' }
	subScript?: boolean
	superScript?: boolean
	style?: string
}

const isBoldWeight = (weight: unknown) => {
	if (typeof weight === 'number') return weight >= 600
	if (typeof weight !== 'string') return false
	if (weight === 'bold' || weight === 'bolder') return true
	const numeric = Number.parseInt(weight, 10)
	return Number.isFinite(numeric) && numeric >= 600
}

/**
 * Mark sebuah node teks → properti run. `inherited` adalah rupa yang diwarisi
 * dari wadahnya (sel judul tabel yang tebal, kutipan yang miring dan abu-abu,
 * butir centang yang dicoret); mark milik teks itu sendiri selalu menang.
 */
export function runStyleOf(marks: readonly MarkLike[], inherited: RunStyle = {}, basePt = 11): RunStyle {
	const style: RunStyle = { ...inherited }

	for (const mark of marks) {
		const attrs = mark.attrs
		switch (mark.type.name) {
			case 'bold':
				style.bold = true
				break
			case 'italic':
				style.italics = true
				break
			case 'underline':
				style.underline = {}
				break
			case 'strike':
				style.strike = true
				break
			case 'subscript':
				style.subScript = true
				style.superScript = undefined
				break
			case 'superscript':
				style.superScript = true
				style.subScript = undefined
				break
			case 'code':
				style.font = CODE_FONT
				style.shading = { type: 'clear', fill: CODE_SHADING, color: 'auto' }
				break
			case 'highlight': {
				// Tanpa warna: sorotan bawaan Tiptap, yaitu kuning stabilo.
				const fill = attrs.color === undefined || attrs.color === null ? 'FFFF00' : cssColorToHex(attrs.color)
				if (!fill) break
				const named = wordHighlightOf(fill)
				if (named) {
					style.highlight = named
					style.highlightComplexScript = false
				} else style.shading = { type: 'clear', fill, color: 'auto' }
				break
			}
			case 'textStyle': {
				const color = cssColorToHex(attrs.color)
				if (color) style.color = color
				const font = fontNameOf(attrs.fontFamily)
				if (font) style.font = font
				const size = fontSizeHalfPoints(attrs.fontSize, basePt)
				if (size) style.size = size
				const background = cssColorToHex(attrs.backgroundColor)
				if (background && !style.highlight) style.shading = { type: 'clear', fill: background, color: 'auto' }
				if (isBoldWeight(attrs.fontWeight)) style.bold = true
				break
			}
		}
	}

	// Kode tetap berhuruf lebar-tetap walau textStyle menyebut huruf lain.
	if (marks.some((mark) => mark.type.name === 'code')) style.font = CODE_FONT
	return style
}

/** Alamat tautan pada mark node teks, sudah dinormalkan untuk Word. */
export function linkOfMarks(marks: readonly MarkLike[]): string | null {
	const link = marks.find((mark) => mark.type.name === 'link')
	return link ? externalLinkOf(link.attrs.href) : null
}
