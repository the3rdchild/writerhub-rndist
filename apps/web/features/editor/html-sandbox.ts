/**
 * Mengurung HTML yang tidak dipercaya. Isinya boleh datang dari model atau dari
 * tempelan pengguna, jadi ia tidak pernah dirender di dalam halaman: ia hidup di
 * `<iframe>` tanpa satu pun kemampuan yang diberikan.
 *
 * Dua lapis, sengaja tumpang tindih:
 *
 * 1. **`sandbox=""`** - atribut kosong mencabut semuanya sekaligus. Tanpa
 *    `allow-same-origin` bingkainya mendapat asal unik, jadi ia tidak bisa
 *    membaca cookie sesi, `localStorage`, maupun DOM induknya; tanpa
 *    `allow-scripts` tidak ada skrip yang jalan; tanpa `allow-top-navigation` ia
 *    tidak bisa memindahkan halaman induk.
 * 2. **CSP `default-src 'none'`** - andai satu hari skrip perlu diizinkan,
 *    jaringannya tetap tertutup: tidak ada `fetch`, gambar jauh, atau font jauh
 *    yang bisa dipakai memanggil pulang.
 *
 * Yang lolos hanya gaya sebaris dan gambar/font ber-URI `data:`. Itu bukan
 * kekurangan melainkan syarat: berkas yang diekspor harus utuh tanpa jaringan,
 * jadi apa pun yang tidak tertanam memang tidak boleh ikut.
 */

/** Atribut `sandbox` untuk bingkainya. Kosong berarti tidak ada kemampuan sama sekali. */
export const HTML_SANDBOX = ''

const CONTENT_SECURITY_POLICY = [
	"default-src 'none'",
	'img-src data:',
	"style-src 'unsafe-inline'",
	'font-src data:',
].join('; ')

/**
 * Dasar yang menyamakan titik awal semua blok, dipecah dua karena dua
 * pemakainya punya kotak terluar yang berbeda: di bingkai ia `<body>`, di
 * pemotret ia `<div>` di dalam `<foreignObject>` (`html-raster.ts`) - tidak ada
 * `<body>` di sana, jadi pemilih `body { ... }` tidak akan kena.
 *
 * Nilainya harus tetap satu. Kalau keduanya berangkat dari dasar yang berbeda,
 * gambar hasil ekspor tidak akan sama dengan yang dilihat penulis di kanvas.
 */
export const SANDBOX_ROOT_STYLE =
	'margin:0;padding:0;font-family:system-ui,sans-serif;overflow:hidden;word-wrap:break-word'

/** Aturan untuk isi di dalam kotak itu; sama di kedua tempat. */
export const SANDBOX_CONTENT_CSS = 'img, svg, video { max-width: 100%; }'

/**
 * Membungkus potongan HTML menjadi satu dokumen utuh untuk `srcdoc`. Dipakai
 * bingkai di editor maupun pengambil gambar saat ekspor, supaya keduanya
 * merender bahan yang sama persis.
 */
export function sandboxDocument(html: string): string {
	return [
		'<!doctype html><html><head><meta charset="utf-8">',
		`<meta http-equiv="Content-Security-Policy" content="${CONTENT_SECURITY_POLICY}">`,
		`<style>html, body { ${SANDBOX_ROOT_STYLE} } ${SANDBOX_CONTENT_CSS}</style>`,
		'</head><body>',
		html,
		'</body></html>',
	].join('')
}
