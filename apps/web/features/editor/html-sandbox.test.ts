import { describe, expect, test } from 'bun:test'
import { clampHtmlBlockHeight, DEFAULT_HTML_BLOCK_ATTRS } from './html-block'
import {
	HTML_PROBE_SOURCE,
	HTML_SANDBOX,
	SANDBOX_CONTENT_CSS,
	SANDBOX_ROOT_STYLE,
	sandboxDocument,
} from './html-sandbox'

describe('kurungan blok HTML', () => {
	/*
	 * Jaminan terpenting, dan satu-satunya yang tidak boleh pernah dilepas.
	 * Tanpa `allow-same-origin` bingkainya berasal unik: ia tidak bisa membaca
	 * cookie sesi, `localStorage`, maupun DOM induknya. Menambahkannya - bahkan
	 * bersama CSP yang ketat - langsung membuat HTML yang tidak dipercaya bisa
	 * memanggil `/api/*` sebagai pengguna yang sedang masuk.
	 */
	test('tidak pernah mengizinkan asal yang sama', () => {
		expect(HTML_SANDBOX).not.toContain('allow-same-origin')
	})

	test('tidak mengizinkan navigasi halaman induk atau popup', () => {
		expect(HTML_SANDBOX).not.toContain('allow-top-navigation')
		expect(HTML_SANDBOX).not.toContain('allow-popups')
		expect(HTML_SANDBOX).not.toContain('allow-modals')
	})

	test('jaringan ditutup CSP', () => {
		const { srcdoc } = sandboxDocument('<p>halo</p>')
		expect(srcdoc).toContain('Content-Security-Policy')
		expect(srcdoc).toContain("default-src 'none'")
	})

	// Yang boleh lolos hanya bahan yang tertanam sendiri - syarat supaya berkas
	// hasil ekspor utuh tanpa jaringan.
	test('gambar dan font hanya boleh dari URI data:', () => {
		const { srcdoc } = sandboxDocument('')
		expect(srcdoc).toContain('img-src data:')
		expect(srcdoc).toContain('font-src data:')
		expect(srcdoc).not.toContain('img-src *')
	})

	test('gaya sebaris tetap boleh supaya rancangannya bisa berwarna', () => {
		expect(sandboxDocument('').srcdoc).toContain("style-src 'unsafe-inline'")
	})

	test('potongan HTML dibungkus menjadi dokumen utuh', () => {
		const { srcdoc } = sandboxDocument('<h1 style="color:red">Diskon</h1>')
		expect(srcdoc.startsWith('<!doctype html>')).toBe(true)
		expect(srcdoc).toContain('<h1 style="color:red">Diskon</h1>')
		expect(srcdoc.indexOf('<body>')).toBeLessThan(srcdoc.indexOf('<h1'))
	})

	test('dasar gaya dipakai bersama bingkai dan pemotret', () => {
		const { srcdoc } = sandboxDocument('')
		expect(srcdoc).toContain(SANDBOX_ROOT_STYLE)
		expect(srcdoc).toContain(SANDBOX_CONTENT_CSS)
		expect(SANDBOX_ROOT_STYLE).toContain('margin:0')
	})

	/*
	 * Tanpa tinggi di akar, `html` dan `body` bertinggi `auto` - dan setiap
	 * persentase yang mengacu padanya jatuh kembali menjadi `auto`. Rancangan
	 * satu halaman yang menulis `height: 100%`, persis seperti yang diperintahkan
	 * deskripsi `insert_html_block`, mengerut ke setinggi isinya dan menggantung
	 * di sepertiga atas kertas.
	 */
	test('akar dokumen punya tinggi, supaya height:100% bisa bekerja', () => {
		expect(sandboxDocument('').srcdoc).toContain('height: 100%')
	})

	// Pemotret memberi pembungkusnya tinggi piksel sendiri; kalau tinggi ikut
	// masuk ke konstanta bersama, ia justru menimpanya.
	test('tinggi tidak ikut ke konstanta yang dipakai pemotret', () => {
		expect(SANDBOX_ROOT_STYLE).not.toContain('height')
	})
})

/*
 * `allow-scripts` ada supaya bingkainya bisa melaporkan tinggi isinya - tanpa
 * itu penanda "isi terpotong" mustahil, karena asal unik membuat
 * `contentDocument` tak terbaca dari luar. Yang menahan skrip milik HTML tetap
 * mati adalah CSP, jadi properti di bawah ini yang sesungguhnya menjaga.
 */
describe('skrip: hanya probe yang boleh jalan', () => {
	test("script-src tidak pernah memberi 'unsafe-inline'", () => {
		const { srcdoc } = sandboxDocument('<p>x</p>')
		const policy = srcdoc.match(/content="([^"]+)"/)?.[1] ?? ''
		expect(policy).toContain('script-src')
		expect(policy).not.toContain("script-src 'unsafe-inline'")
		expect(policy).not.toContain("'unsafe-eval'")
	})

	test('script-src hanya berisi satu nonce', () => {
		const { srcdoc } = sandboxDocument('')
		const policy = srcdoc.match(/content="([^"]+)"/)?.[1] ?? ''
		const scriptSrc = policy.split('; ').find((part) => part.startsWith('script-src')) ?? ''
		expect(scriptSrc).toMatch(/^script-src 'nonce-[^']+'$/)
	})

	/*
	 * Kalau nonce-nya tetap, HTML tinggal menuliskan `<script nonce="...">`
	 * dengan nilai yang sama dan lolos. Karena diacak tiap render, ia tidak bisa
	 * ditebak - dan inilah yang membuat `allow-scripts` tetap aman.
	 */
	test('nonce diacak ulang setiap render', () => {
		const nonceOf = (html: string) => sandboxDocument(html).srcdoc.match(/script-src 'nonce-([^']+)'/)?.[1]

		const first = nonceOf('<p>sama</p>')
		const second = nonceOf('<p>sama</p>')
		expect(first).toBeTruthy()
		expect(first).not.toBe(second)
	})

	test('token laporan ikut diacak dan tertanam di skripnya', () => {
		const a = sandboxDocument('')
		const b = sandboxDocument('')
		expect(a.token).not.toBe(b.token)
		expect(a.srcdoc).toContain(a.token)
		expect(a.srcdoc).toContain(HTML_PROBE_SOURCE)
	})

	// Skrip yang ikut di HTML tidak membawa nonce, jadi CSP menolaknya - ia
	// masuk apa adanya ke dokumen, tapi tidak pernah dieksekusi.
	test('skrip milik HTML tidak diberi nonce', () => {
		const { srcdoc } = sandboxDocument('<script>fetch("/api/steal")</script>')
		const nonce = srcdoc.match(/script-src 'nonce-([^']+)'/)?.[1] ?? ''
		expect(srcdoc).toContain('fetch("/api/steal")')
		expect(srcdoc).not.toContain(`<script nonce="${nonce}">fetch`)
	})
})

describe('tinggi blok HTML', () => {
	test('nilai di luar batas dijepit', () => {
		expect(clampHtmlBlockHeight(10)).toBe(48)
		expect(clampHtmlBlockHeight(99999)).toBe(4000)
	})

	test('bukan angka jatuh ke bawaan', () => {
		expect(clampHtmlBlockHeight(Number.NaN)).toBe(DEFAULT_HTML_BLOCK_ATTRS.height)
	})

	test('nilai wajar dibulatkan apa adanya', () => {
		expect(clampHtmlBlockHeight(320.4)).toBe(320)
	})

	/*
	 * Sisipan tidak boleh lebih tinggi dari satu halaman. Blok yang melewatinya
	 * tidak bisa lagi diselamatkan paginasi - begitu ia jadi blok pertama di
	 * sebuah halaman, mendorongnya cuma memindahkan luapan - jadi ia menembus
	 * tepi lembar persis seperti keluhan yang memunculkan mode halaman.
	 */
	test('tinggi halaman menjadi batas atas sisipan', () => {
		expect(clampHtmlBlockHeight(2000, 930)).toBe(930)
		expect(clampHtmlBlockHeight(400, 930)).toBe(400)
	})

	test('batas halaman yang tidak masuk akal diabaikan', () => {
		expect(clampHtmlBlockHeight(500, 0)).toBe(500)
		expect(clampHtmlBlockHeight(500, 10)).toBe(500)
	})
})
