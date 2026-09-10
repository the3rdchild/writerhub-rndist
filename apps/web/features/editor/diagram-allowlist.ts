/**
 * Kosakata yang boleh ada di dalam SVG diagram, dan kenapa ia berupa daftar
 * putih.
 *
 * SVG diagram masuk ke halaman lewat `dangerouslySetInnerHTML` - sama seperti
 * Mermaid, tapi tanpa penjaga yang setara. Mermaid aman karena
 * `securityLevel: 'strict'` membersihkan keluarannya sendiri; yang ini ditulis
 * model lalu boleh disunting penulis, jadi tidak ada satu pun tahap yang sudah
 * memeriksanya.
 *
 * Daftar hitam tidak dipakai. Yang berbahaya di SVG bukan satu-dua elemen
 * melainkan seluruh permukaan yang jarang diingat - `<foreignObject>` yang
 * menyelundupkan HTML, `<animate attributeName="href">`, `<set>`, penangan
 * `on*` di elemen mana pun. Daftar putih gagal ke arah yang benar: kosakata
 * yang belum dikenal ditolak, bukan diloloskan.
 *
 * Isinya diturunkan dari inventaris 162 contoh upstream, bukan dikarang: yang
 * benar-benar dipakai diagram editorial masuk, sisanya tidak.
 *
 * Dipisahkan dari `diagram-svg.ts` karena berkas ini murni data dan predikat -
 * seluruh keputusannya bisa diuji tanpa DOM, sementara penelusur pohonnya
 * tinggal jadi lingkaran yang tidak memutuskan apa-apa.
 */

/**
 * Yang sengaja **tidak** ada di sini, beserta harganya:
 *
 * - `<foreignObject>` - menyelundupkan HTML utuh ke dalam SVG. Upstream
 *   memakainya di satu tipe saja (medallion); tipe itu yang mengalah.
 * - `<style>` - CSS di dalam SVG **tidak ter-scope**, dan blok ini dirender di
 *   aliran dokumen, bukan di iframe. Satu aturan di dalamnya mengubah seluruh
 *   halaman. Diagram editorial memang tidak membutuhkannya: gayanya ada sebagai
 *   atribut presentasi di tiap elemen.
 * - `<image>` - satu-satunya cara memuat sumber daya jauh dari dalam SVG.
 * - `<a>` - navigasi tidak punya urusan di gambar cetak.
 * - Elemen animasi (`animate`, `animateTransform`, `set`) - keduanya bisa
 *   mengubah atribut yang sudah disaring, sesudah penyaringannya lewat.
 * - Primitif filter (`feGaussianBlur` dan kawan-kawan) - kebetulan sejalan
 *   dengan aturan gaya yang melarang bayangan.
 */
export const ALLOWED_ELEMENTS: ReadonlySet<string> = new Set([
	'svg',
	'g',
	'defs',
	'symbol',
	'use',
	'marker',
	'pattern',
	'clipPath',
	'mask',
	'linearGradient',
	'radialGradient',
	'stop',
	'path',
	'rect',
	'circle',
	'ellipse',
	'line',
	'polyline',
	'polygon',
	'text',
	'tspan',
	'title',
	'desc',
])

/** Nama atribut yang diloloskan apa adanya, tanpa memeriksa nilainya. */
export const ALLOWED_ATTRIBUTES: ReadonlySet<string> = new Set([
	// geometri
	'x',
	'y',
	'x1',
	'y1',
	'x2',
	'y2',
	'dx',
	'dy',
	'cx',
	'cy',
	'r',
	'rx',
	'ry',
	'width',
	'height',
	'd',
	'points',
	'transform',
	'viewBox',
	'preserveAspectRatio',
	'offset',
	'gradientUnits',
	'gradientTransform',
	'spreadMethod',
	'patternUnits',
	'patternContentUnits',
	'patternTransform',
	'clipPathUnits',
	'maskUnits',
	'markerWidth',
	'markerHeight',
	'markerUnits',
	'refX',
	'refY',
	'orient',
	// cat dan garis
	'fill',
	'fill-opacity',
	'fill-rule',
	'stroke',
	'stroke-width',
	'stroke-opacity',
	'stroke-dasharray',
	'stroke-dashoffset',
	'stroke-linecap',
	'stroke-linejoin',
	'stroke-miterlimit',
	'opacity',
	'color',
	'display',
	'visibility',
	'stop-color',
	'stop-opacity',
	'paint-order',
	'vector-effect',
	'shape-rendering',
	// huruf
	'font-family',
	'font-size',
	'font-weight',
	'font-style',
	'font-variant',
	'letter-spacing',
	'word-spacing',
	'text-anchor',
	'text-decoration',
	'dominant-baseline',
	'alignment-baseline',
	'baseline-shift',
	// identitas dan aksesibilitas
	'id',
	'lang',
	'role',
	'xmlns',
	'xmlns:xlink',
])

/**
 * Atribut yang nilainya harus menunjuk ke dalam berkas ini sendiri.
 *
 * `url(#arrow)` adalah cara diagram memasang mata panah dan pola titik, jadi ia
 * tidak bisa dilarang. Yang dilarang adalah nilai yang menunjuk ke luar.
 */
const LOCAL_REFERENCE_ATTRIBUTES: ReadonlySet<string> = new Set([
	'marker-start',
	'marker-mid',
	'marker-end',
	'clip-path',
	'mask',
])

/** `<use href="#icon-file">` - satu-satunya `href` yang masuk akal di sini. */
const FRAGMENT_ATTRIBUTES: ReadonlySet<string> = new Set(['href', 'xlink:href'])

function isLocalReference(value: string): boolean {
	const trimmed = value.trim()
	if (trimmed === 'none' || trimmed === '') return true
	// Boleh berantai: `url(#a) url(#b)` dipakai paint-order dan marker majemuk.
	const references = trimmed.match(/url\([^)]*\)/g)
	if (!references) return false
	if (trimmed.replace(/url\([^)]*\)/g, '').trim() !== '') return false
	return references.every((reference) => /^url\(\s*['"]?#[^'")]+['"]?\s*\)$/.test(reference))
}

/**
 * Nilai `style` sebaris.
 *
 * Berbeda dari elemen `<style>`, ia tidak punya selektor dan karena itu tidak
 * bisa bocor keluar dari elemennya. Yang tetap harus ditolak adalah nilai yang
 * memuat skema atau rujukan ke luar.
 */
function isSafeInlineStyle(value: string): boolean {
	const lowered = value.toLowerCase()
	if (lowered.includes('javascript:') || lowered.includes('expression(')) return false
	if (lowered.includes('@import')) return false
	const references = lowered.match(/url\([^)]*\)/g)
	if (!references) return true
	return references.every((reference) => /^url\(\s*['"]?#/.test(reference))
}

export function isAllowedElement(name: string): boolean {
	return ALLOWED_ELEMENTS.has(name)
}

/**
 * Nama **dan** nilainya diperiksa bersama: sebagian atribut hanya aman selama
 * nilainya menunjuk ke dalam dokumen ini sendiri.
 */
export function isAllowedAttribute(name: string, value: string): boolean {
	const lowered = name.toLowerCase()

	/*
	 * Diperiksa lebih dulu, dan tidak lewat daftar. Penangan kejadian tidak
	 * pernah muncul di daftar putih, tapi menolaknya di sini membuat kesalahan
	 * ketik pada daftar itu tidak berubah jadi lubang.
	 */
	if (lowered.startsWith('on')) return false

	/*
	 * `data-*` menyimpan angka asli tiap mark - itu yang membuat chart bisa
	 * dikoreksi pembaca. Tanpa skrip ia inert.
	 */
	if (lowered.startsWith('data-')) return true
	if (lowered.startsWith('aria-')) return true

	if (lowered === 'style') return isSafeInlineStyle(value)
	if (LOCAL_REFERENCE_ATTRIBUTES.has(lowered)) return isLocalReference(value)
	if (FRAGMENT_ATTRIBUTES.has(lowered)) return value.trim().startsWith('#')

	return ALLOWED_ATTRIBUTES.has(name) || ALLOWED_ATTRIBUTES.has(lowered)
}
