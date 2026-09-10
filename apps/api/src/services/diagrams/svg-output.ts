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
	} else if (size.height > size.width) {
		problems.push(
			`the viewBox is taller (${size.height}) than it is wide (${size.width}) — a diagram that tall is clipped at the page edge; make it wider or split it in two`,
		)
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
