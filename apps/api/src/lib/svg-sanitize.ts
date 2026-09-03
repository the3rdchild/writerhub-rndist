/**
 * Membersihkan SVG unggahan sebelum ia pernah tersimpan.
 *
 * SVG bukan gambar melainkan dokumen: ia boleh memuat `<script>`, penangan
 * sebaris seperti `onload`, dan rujukan ke berkas lain. Selama ia hanya dipakai
 * lewat `<img>` di dalam blok HTML, semua itu mati sendiri - peramban tidak
 * pernah menjalankan skrip di SVG yang dimuat sebagai gambar. Tapi jaminan itu
 * milik cara pakainya, bukan milik berkasnya, dan ia lenyap begitu URL aset
 * dibuka langsung di sebuah tab. Karena itu pembersihannya dilakukan saat
 * unggah: yang tersimpan di penyimpanan sudah tidak berbahaya, apa pun yang
 * membukanya nanti.
 *
 * Dikerjakan dengan penulisan ulang berbasis regex, bukan pengurai XML, karena
 * di sisi server tidak ada DOM. Konsekuensinya ia sengaja **terlalu galak**:
 * SVG yang menyimpan datanya di tempat aneh bisa ikut terpangkas. Untuk aset
 * hiasan itu pertukaran yang benar - kehilangan satu filter eksotis jauh lebih
 * murah daripada meloloskan satu vektor skrip.
 */

/** Elemen yang tidak pernah punya alasan sah ada di aset hiasan. */
const FORBIDDEN_ELEMENTS = [
	'script',
	'foreignObject',
	'iframe',
	'embed',
	'object',
	'animate',
	'set',
	'handler',
]

/** Skema URI yang boleh muncul di atribut rujukan. */
const SAFE_URI = /^(#|data:image\/(png|jpeg|gif|webp);base64,)/i

export interface SvgSanitizeResult {
	svg: string
	/** Apa saja yang dibuang, untuk ditampilkan ke pengunggah. */
	removed: string[]
}

function stripElement(svg: string, tag: string, removed: string[]): string {
	// Pasangan buka-tutup beserta isinya, lalu bentuk tunggal yang menutup sendiri.
	const paired = new RegExp(`<${tag}\\b[\\s\\S]*?<\\/${tag}\\s*>`, 'gi')
	const single = new RegExp(`<${tag}\\b[^>]*\\/?>`, 'gi')

	let next = svg.replace(paired, () => {
		removed.push(`<${tag}>`)
		return ''
	})
	next = next.replace(single, () => {
		removed.push(`<${tag}>`)
		return ''
	})
	return next
}

/**
 * Mengembalikan SVG yang sudah dibersihkan, atau `null` kalau isinya sama
 * sekali bukan SVG. Menolak itu jawaban yang benar: berkas yang mengaku
 * `image/svg+xml` tapi tidak punya elemen `<svg>` adalah sesuatu yang lain.
 */
export function sanitizeSvg(source: string): SvgSanitizeResult | null {
	if (!/<svg[\s>]/i.test(source)) return null

	const removed: string[] = []
	let svg = source

	// Komentar dan blok CDATA lebih dulu: keduanya tempat favorit untuk
	// menyembunyikan potongan yang baru menyatu setelah aturan lain berjalan.
	svg = svg.replace(/<!--[\s\S]*?-->/g, '')
	svg = svg.replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, '')

	for (const tag of FORBIDDEN_ELEMENTS) svg = stripElement(svg, tag, removed)

	// Penangan sebaris. Dicocokkan pada batas atribut (spasi lalu `on…=`) supaya
	// atribut sah yang kebetulan berakhiran "on" tidak ikut terpangkas.
	svg = svg.replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, () => {
		removed.push('atribut on*')
		return ''
	})

	// Rujukan luar. `href`/`xlink:href` ke http(s), `javascript:`, atau berkas
	// lain - semuanya permintaan jaringan yang tidak boleh ada di aset mandiri.
	svg = svg.replace(/\s(?:xlink:)?href\s*=\s*("([^"]*)"|'([^']*)')/gi, (match, _quoted, double, single) => {
		const value = (double ?? single ?? '').trim()
		if (SAFE_URI.test(value)) return match
		removed.push('rujukan luar')
		return ''
	})

	// `url(...)` di dalam gaya yang menunjuk keluar berkas.
	svg = svg.replace(/url\(\s*['"]?(?!#)([^)'"]*)['"]?\s*\)/gi, () => {
		removed.push('url() luar')
		return 'none'
	})

	return { svg, removed: [...new Set(removed)] }
}
