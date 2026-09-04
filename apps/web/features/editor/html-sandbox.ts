/**
 * Mengurung HTML yang tidak dipercaya. Isinya boleh datang dari model atau dari
 * tempelan pengguna, jadi ia tidak pernah dirender di dalam halaman: ia hidup di
 * `<iframe>` berasal unik, dengan jaringan tertutup rapat.
 *
 * Tiga lapis, sengaja tumpang tindih:
 *
 * 1. **Tanpa `allow-same-origin`** - bingkainya mendapat asal unik, jadi ia
 *    tidak bisa membaca cookie sesi, `localStorage`, maupun DOM induknya, dan
 *    tanpa `allow-top-navigation` ia tidak bisa memindahkan halaman induk. Ini
 *    jaminan terpentingnya, dan ia tidak boleh dilepas.
 * 2. **CSP `default-src 'none'`** - tidak ada `fetch`, gambar jauh, atau font
 *    jauh yang bisa dipakai memanggil pulang. Yang lolos hanya gaya sebaris dan
 *    bahan ber-URI `data:`. Itu bukan kekurangan melainkan syarat: berkas hasil
 *    ekspor harus utuh tanpa jaringan.
 * 3. **`script-src` hanya menerima satu nonce acak** - lihat di bawah.
 *
 * ## Kenapa `allow-scripts` ada di sini
 *
 * Bingkai yang benar-benar bisu tidak bisa memberi tahu apa pun tentang dirinya,
 * termasuk setinggi apa isinya - dan tanpa angka itu blok mode halaman tidak
 * bisa memberi tahu penulis bahwa rancangannya terpotong batas halaman. Karena
 * asalnya unik, `contentDocument` tidak bisa dibaca dari luar; satu-satunya
 * jalan adalah bingkainya sendiri yang melapor lewat `postMessage`.
 *
 * Yang membuatnya tetap aman: **nonce-nya diacak ulang setiap render**, dan
 * `script-src` hanya mengizinkan nonce itu. Skrip yang ikut di dalam HTML tidak
 * membawanya, jadi ia diblokir - begitu juga penangan sebaris seperti
 * `<img onerror>`, karena `'unsafe-inline'` tidak pernah diberikan ke skrip.
 * Nonce yang diacak berarti HTML juga tidak bisa menebak lalu menuliskannya
 * sendiri. CSP tambahan yang mungkin diselundupkan lewat `<meta>` hanya bisa
 * memperketat, tidak pernah melonggarkan.
 */

/**
 * Skrip boleh jalan, tetapi hanya yang ber-nonce - lihat catatan di atas.
 * `allow-same-origin` tidak ada di sini dan tidak boleh ditambahkan.
 */
export const HTML_SANDBOX = 'allow-scripts'

/** Penanda pesan supaya induk tidak salah menangkap `postMessage` milik orang lain. */
export const HTML_PROBE_SOURCE = 'writerhub-html-block'

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

/**
 * Tinggi kotak terluar, dan alasannya perlu disebut sama sekali.
 *
 * Bingkai blok selalu punya tinggi yang pasti - setinggi lembar di mode
 * halaman, setinggi atribut di mode sisipan. Tapi `html` dan `body` di dalamnya
 * tidak mewarisi itu: tanpa aturan ini keduanya bertinggi `auto`, dan setiap
 * persentase yang mengacu padanya jatuh kembali menjadi `auto`.
 *
 * Akibatnya `height: 100%` - yang justru **kami sendiri** perintahkan ke model
 * lewat deskripsi `insert_html_block` - membuat rancangan mengerut ke setinggi
 * isinya, bukan memenuhi halaman. Model yang patuh tetap menghasilkan flyer
 * yang menggantung di sepertiga atas kertas.
 *
 * Tidak disatukan ke `SANDBOX_ROOT_STYLE` karena pemotret sudah memberi
 * pembungkusnya tinggi piksel yang sebenarnya; menaruh `100%` di konstanta
 * bersama justru akan menimpanya.
 */
const ROOT_HEIGHT = 'height: 100%'

/**
 * Aturan untuk isi di dalam kotak itu; sama di kedua tempat.
 *
 * `print-color-adjust: exact` ada di sini karena bingkainya **dokumen
 * tersendiri**: tidak ada satu pun aturan cetak di `globals.css` yang menembus
 * ke dalamnya. Tanpa ini, Chrome menuruti setelan "Background graphics" yang
 * mati secara bawaan - latar merah flyer hilang, dan teks putih di atasnya
 * tercetak putih di atas kertas putih. Halamannya keluar seolah kosong, bukan
 * seolah salah warna, jadi kegagalannya sulit dikenali.
 */
export const SANDBOX_CONTENT_CSS =
	'img, svg, video { max-width: 100%; } * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }'

export interface SandboxedDocument {
	srcdoc: string
	/** Ikut dikirim bersama laporan tinggi, supaya pesannya bisa dicocokkan. */
	token: string
}

function randomToken(): string {
	if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
	return `t${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`
}

function policy(nonce: string): string {
	return [
		"default-src 'none'",
		'img-src data:',
		"style-src 'unsafe-inline'",
		'font-src data:',
		`script-src 'nonce-${nonce}'`,
	].join('; ')
}

/**
 * Melaporkan setinggi apa isinya sebenarnya, supaya induk tahu apakah
 * rancangannya melewati batas halaman.
 *
 * Tingginya dihitung dari kotak batas tiap anak `<body>`, bukan dari
 * `scrollHeight`: `overflow:hidden` di root memangkas daerah gulir, jadi
 * `scrollHeight` melaporkan tinggi yang sudah terpotong - persis angka yang
 * tidak berguna di sini.
 */
function probeScript(token: string): string {
	return `(function(){
	var report=function(){
		var bottom=0;
		var kids=document.body?document.body.children:[];
		for(var i=0;i<kids.length;i++){
			var box=kids[i].getBoundingClientRect();
			if(box.bottom>bottom)bottom=box.bottom;
		}
		parent.postMessage({source:${JSON.stringify(HTML_PROBE_SOURCE)},token:${JSON.stringify(token)},height:Math.ceil(bottom)},'*');
	};
	report();
	addEventListener('load',report);
	if(window.ResizeObserver&&document.body)new ResizeObserver(report).observe(document.body);
})();`
}

/**
 * Membungkus potongan HTML menjadi satu dokumen utuh untuk `srcdoc`.
 *
 * `fontCss` datang sebagai argumen, bukan diambil sendiri di sini, karena
 * mengambilnya asinkron sementara fungsi ini murni dan diuji sebagai fungsi
 * murni. Yang menyelesaikannya `font-embed.ts`; pemanggil yang belum sempat
 * menunggunya cukup tidak mengirim apa-apa, dan rancangannya jatuh ke font
 * sistem seperti sebelumnya.
 */
export function sandboxDocument(html: string, fontCss = ''): SandboxedDocument {
	const token = randomToken()
	const nonce = randomToken()

	return {
		token,
		srcdoc: [
			'<!doctype html><html><head><meta charset="utf-8">',
			`<meta http-equiv="Content-Security-Policy" content="${policy(nonce)}">`,
			`<style>${fontCss}html, body { ${SANDBOX_ROOT_STYLE}; ${ROOT_HEIGHT} } ${SANDBOX_CONTENT_CSS}</style>`,
			'</head><body>',
			html,
			`<script nonce="${nonce}">${probeScript(token)}</script>`,
			'</body></html>',
		].join(''),
	}
}
