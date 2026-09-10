/**
 * Memeriksa jawaban model sebelum ia dikirim ke penulis.
 *
 * **Ini bukan penyaring keamanan.** Penyaring yang sebenarnya ada di
 * `apps/web/features/editor/diagram-svg.ts` dan berjalan saat blok digambar -
 * di sanalah satu-satunya tempat yang melihat *semua* sumber, termasuk yang
 * disunting penulis dengan tangan sesudahnya, yang tidak pernah melewati server
 * sama sekali. Menaruh penyaring kedua di sini hanya akan melahirkan dua daftar
 * yang perlahan berbeda, dan yang lebih longgar akan dikira menjaga.
 *
 * Yang dikerjakan berkas ini adalah pemeriksaan **muka**: menangkap jawaban
 * yang sudah pasti salah supaya model bisa diminta mengulang selagi permintaan
 * masih hidup - bukan supaya penulis yang menemukannya di petak kosong.
 *
 * Karena itu semuanya berupa operasi teks: server tidak punya pengurai XML, dan
 * menambah satu dependensi demi tebakan awal tidak sebanding.
 */

/**
 * Setinggi apa gambar boleh dibanding lebarnya.
 *
 * Angkanya berasal dari kertas, bukan dari selera. Kotak isi A4 potret pada 96
 * dpi kira-kira 642x971 px sesudah margin, dan diagram selalu diskalakan ke
 * lebar kolom - jadi rasio di atas ~1,5 mulai melewati satu lembar, dan
 * `break-inside: avoid` tidak bisa lagi menahannya utuh.
 *
 * Sempat 1,0. Itu terlalu ketat, dan akibatnya bukan diagram yang lebih pendek
 * melainkan **viewBox yang berbohong**: model memenuhi aturannya dengan
 * memotong kanvas, dan sepertiga bawah gambarnya hilang tanpa satu pun pesan.
 * Aturan yang mendorong model berbohong lebih buruk daripada tidak ada aturan.
 */
const MAX_ASPECT = 1.5

const SVG_BLOCK = /<svg\b[\s\S]*<\/svg\s*>/i
const VIEW_BOX = /viewBox\s*=\s*["']\s*([\d.-]+)\s+([\d.-]+)\s+([\d.-]+)\s+([\d.-]+)\s*["']/i
const TITLE = /<title\b[^>]*>([\s\S]*?)<\/title\s*>/i
const DESC = /<desc\b[^>]*>([\s\S]*?)<\/desc\s*>/i

/**
 * Bentuk yang dilarang, disebutkan sebagai kalimat yang bisa dibaca model.
 *
 * Kalimatnya penting: ia dikirim kembali sebagai keluhan saat meminta ulang,
 * dan model yang diberi tahu "no <style> element" memperbaikinya, sementara
 * model yang diberi tahu "invalid" mengarang ulang dari nol.
 */
const FORBIDDEN: ReadonlyArray<readonly [RegExp, string]> = [
	[/<script\b/i, 'a <script> element'],
	[/<style\b/i, 'a <style> element'],
	[/<foreignObject\b/i, 'a <foreignObject> element'],
	[/<image\b/i, 'an <image> element'],
	[/<a\b/i, 'an <a> element'],
	[/<animate|<set\b/i, 'an animation element'],
	[/\son[a-z]+\s*=/i, 'an on… event handler'],
	[/(?:href|src)\s*=\s*["']\s*(?!#)[a-z]+:/i, 'a reference that points outside the file'],
	[/url\(\s*["']?(?!#)/i, 'a url() that does not point inside the file'],
]

/** Memotong `<svg>…</svg>` dari jawaban yang mungkin berpagar atau berbasa-basi. */
export function extractSvg(answer: string): string | null {
	const match = SVG_BLOCK.exec(answer)
	return match ? match[0].trim() : null
}

export interface SvgSize {
	width: number
	height: number
}

export function viewBoxSize(svg: string): SvgSize | null {
	const match = VIEW_BOX.exec(svg)
	if (!match) return null
	const width = Number(match[3])
	const height = Number(match[4])
	if (!(width > 0) || !(height > 0)) return null
	return { width, height }
}

/**
 * Sejauh mana gambarnya benar-benar membentang, ditaksir dari bentuk-bentuknya.
 *
 * Ini menangkap kegagalan yang paling sulit dilihat: `viewBox` yang lebih kecil
 * daripada isinya. Gambarnya terurai dengan benar, tampil dengan benar, dan
 * sepertiga bagiannya **hilang tanpa pesan apa pun** - tidak ada yang rusak,
 * cuma ada yang tidak ada.
 *
 * Yang dihitung hanya bentuk yang menentukan tepi gambar: kotak, lingkaran,
 * teks, poligon, garis. `<path>` sengaja dilewati - ia dipakai untuk konektor
 * antar simpul, jadi jangkauannya sudah dibatasi simpul yang dihubungkannya,
 * sementara mengurai `d` dengan benar butuh pengurai jalur sungguhan. Taksiran
 * yang melewatkan kasus tepi lebih baik daripada taksiran yang menuduh gambar
 * yang benar.
 */
export function contentExtent(svg: string): SvgSize | null {
	let width = 0
	let height = 0
	const seen = (x: number, y: number) => {
		if (Number.isFinite(x)) width = Math.max(width, x)
		if (Number.isFinite(y)) height = Math.max(height, y)
	}

	const attr = (tag: string, name: string): number => {
		const match = new RegExp(`\\b${name}\\s*=\\s*["']([^"']*)["']`).exec(tag)
		return match ? Number.parseFloat(match[1]) : Number.NaN
	}

	for (const [tag, name] of svg.matchAll(/<(rect|circle|ellipse|text|polygon|polyline|line)\b([^>]*)>/gi)) {
		const kind = name.toLowerCase()
		const body = tag

		if (kind === 'rect') {
			seen(attr(body, 'x') + attr(body, 'width'), attr(body, 'y') + attr(body, 'height'))
			continue
		}
		if (kind === 'circle') {
			seen(attr(body, 'cx') + attr(body, 'r'), attr(body, 'cy') + attr(body, 'r'))
			continue
		}
		if (kind === 'ellipse') {
			seen(attr(body, 'cx') + attr(body, 'rx'), attr(body, 'cy') + attr(body, 'ry'))
			continue
		}
		if (kind === 'text') {
			seen(attr(body, 'x'), attr(body, 'y'))
			continue
		}
		if (kind === 'line') {
			seen(Math.max(attr(body, 'x1'), attr(body, 'x2')), Math.max(attr(body, 'y1'), attr(body, 'y2')))
			continue
		}

		const points = /\bpoints\s*=\s*["']([^"']*)["']/.exec(body)?.[1] ?? ''
		const numbers = points
			.split(/[\s,]+/)
			.map(Number)
			.filter(Number.isFinite)
		for (let index = 0; index + 1 < numbers.length; index += 2) seen(numbers[index], numbers[index + 1])
	}

	return width > 0 && height > 0 ? { width, height } : null
}

/**
 * Keluhan yang bisa dikirim balik ke model, kosong kalau tidak ada.
 *
 * Dikembalikan sebagai daftar, bukan sebagai gagal-pada-yang-pertama: jawaban
 * yang punya tiga masalah sebaiknya diperbaiki sekali jalan, bukan tiga kali
 * bolak-balik.
 */
export function structuralProblems(svg: string): string[] {
	const problems: string[] = []

	const size = viewBoxSize(svg)
	if (!size) {
		problems.push('no usable viewBox — add viewBox="0 0 width height"')
	} else {
		if (size.height > size.width * MAX_ASPECT) {
			problems.push(
				`the viewBox is ${size.width}x${size.height}, more than ${MAX_ASPECT}x taller than it is wide — that overruns one page. Remove nodes or change the layout; do NOT shrink the viewBox`,
			)
		}

		const extent = contentExtent(svg)
		if (extent && (extent.width > size.width || extent.height > size.height)) {
			problems.push(
				`the drawing runs to ${Math.round(extent.width)}x${Math.round(extent.height)} but the viewBox is only ${size.width}x${size.height}, so everything past the edge is cut off. Grow the viewBox to contain the whole drawing, or draw less`,
			)
		}
	}

	if (!TITLE.test(svg)) problems.push('no <title> — it is required for accessibility')
	if (!DESC.test(svg)) problems.push('no <desc> — say in one sentence what the diagram shows')

	for (const [pattern, described] of FORBIDDEN) {
		if (pattern.test(svg)) problems.push(`${described} — not allowed, and it will be stripped before drawing`)
	}

	return problems
}

/**
 * Tanda terima untuk model utama.
 *
 * Judul dan deskripsi diambil dari gambarnya sendiri, bukan dari permintaan
 * yang dikirim: model utama tidak pernah melihat hasilnya, jadi satu-satunya
 * cara ia bisa menyadari sub-agent salah paham adalah membaca apa yang
 * benar-benar digambar.
 */
export function svgReceipt(svg: string): { title: string; desc: string; size: SvgSize | null } {
	return {
		title: TITLE.exec(svg)?.[1].trim() ?? '',
		desc: DESC.exec(svg)?.[1].trim() ?? '',
		size: viewBoxSize(svg),
	}
}
