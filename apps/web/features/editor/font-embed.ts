import { EMBEDDABLE_FONTS, type EmbeddableFont, FONT_FILE_BASE } from '@writer-hub/shared'

/**
 * Menyematkan font ke dalam blok rancangan sebagai `data:` URI.
 *
 * Blok rancangan hidup di dua tempat yang keduanya **terputus dari jaringan**,
 * dan itu yang menentukan seluruh bentuk berkas ini:
 *
 * - Bingkai `srcdoc` (`html-sandbox.ts`) berjalan di bawah CSP `default-src
 *   'none'` dengan `font-src data:`.
 * - Pemotret (`html-raster.ts`) merender lewat `<foreignObject>` di dalam SVG
 *   yang dimuat sebagai `data:image/svg+xml` ke dalam `<img>`. Dokumen begitu
 *   tidak memuat apa pun dari URL - bahkan dari origin yang sama.
 *
 * Karena itu font tidak bisa dirujuk lewat URL sama sekali. Melonggarkan CSP
 * bingkai saja akan membuat rancangan benar di layar dan salah di PNG dan DOCX,
 * yaitu kegagalan yang tidak meninggalkan jejak selain "fontnya kok beda".
 *
 * Yang disematkan hanya keluarga yang benar-benar disebut markup-nya. Satu
 * woff2 ~8-100KB, jadi menyuntikkan semuanya berarti membengkakkan tiap bingkai
 * dengan 1,5MB yang tidak dipakai.
 *
 * Bytes-nya tidak pernah ikut tersimpan ke dokumen: node `htmlBlock` menyimpan
 * markup body saja, dan penyuntikan ini terjadi saat merender.
 */

/**
 * Isi tiap deklarasi `font-family` di markup.
 *
 * Sengaja tidak mengurai CSS: yang dibutuhkan cuma daftar nama, dan pengurai
 * sungguhan berarti satu dependensi baru untuk pekerjaan yang diselesaikan satu
 * pola. Mencari nama keluarga di seluruh teks juga sempat dipertimbangkan dan
 * dibuang - flyer yang menyebut "Lora" sebagai nama orang akan menyeret satu
 * berkas font ikut ke dalam bingkainya.
 */
const DECLARATION = /font-family\s*:\s*([^;{}]*)/gi

/** Keluarga yang tersedia dan memang dirujuk markup ini. */
export function fontsUsedIn(html: string): EmbeddableFont[] {
	const declared = [...html.matchAll(DECLARATION)].map(([, value]) => value.toLowerCase()).join(' | ')
	if (!declared) return []

	return EMBEDDABLE_FONTS.filter((font) => declared.includes(font.family.toLowerCase()))
}

/**
 * `btoa` menerima string, jadi bytes-nya harus jadi karakter dulu - dan
 * `String.fromCharCode(...bytes)` atas berkas 100KB melampaui batas argumen
 * dan melempar `RangeError`. Karena itu dipotong per blok.
 */
const CHUNK = 0x8000

function base64Of(bytes: Uint8Array): string {
	let binary = ''
	for (let index = 0; index < bytes.length; index += CHUNK) {
		binary += String.fromCharCode(...bytes.subarray(index, index + CHUNK))
	}
	return btoa(binary)
}

/**
 * Satu berkas diambil sekali seumur halaman.
 *
 * Yang disimpan janjinya, bukan hasilnya: dua blok yang memakai font sama dan
 * dirender berbarengan - hal biasa saat dokumen dibuka - kalau tidak akan
 * mengambil berkas yang sama dua kali.
 */
const cache = new Map<string, Promise<string | null>>()

function dataUri(file: string): Promise<string | null> {
	const cached = cache.get(file)
	if (cached) return cached

	const pending = (async () => {
		try {
			const response = await fetch(`${FONT_FILE_BASE}${file}`)
			if (!response.ok) return null
			return `data:font/woff2;base64,${base64Of(new Uint8Array(await response.arrayBuffer()))}`
		} catch {
			// Font yang gagal diambil bukan alasan membatalkan rancangannya:
			// tanpa `@font-face`-nya, teksnya jatuh ke font sistem dan tetap
			// terbaca. Melempar dari sini akan mengosongkan seluruh bingkai.
			return null
		}
	})()

	cache.set(file, pending)
	return pending
}

/**
 * Blok `@font-face` untuk keluarga yang dipakai markup ini, siap disisipkan ke
 * dalam `<style>` bingkai maupun pemotret. Kosong kalau tidak ada yang dipakai.
 */
export async function fontFaceCss(html: string): Promise<string> {
	const fonts = fontsUsedIn(html)
	if (fonts.length === 0) return ''

	const faces = fonts.flatMap((font) => font.faces.map((face) => ({ font, face })))
	const sources = await Promise.all(faces.map(({ face }) => dataUri(face.file)))

	return faces
		.map(({ font, face }, index) => {
			const source = sources[index]
			if (!source) return ''
			return `@font-face{font-family:'${font.family}';font-style:${face.style};font-weight:${face.weight};font-display:block;src:url(${source}) format('woff2')}`
		})
		.filter(Boolean)
		.join('')
}
