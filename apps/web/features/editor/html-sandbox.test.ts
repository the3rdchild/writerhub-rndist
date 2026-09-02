import { describe, expect, test } from 'bun:test'
import { clampHtmlBlockHeight, DEFAULT_HTML_BLOCK_ATTRS } from './html-block'
import { HTML_SANDBOX, SANDBOX_CONTENT_CSS, SANDBOX_ROOT_STYLE, sandboxDocument } from './html-sandbox'

describe('kurungan blok HTML', () => {
	// Ini bukan uji kosmetik. `sandbox=""` mencabut seluruh kemampuan bingkai;
	// menambahkan `allow-same-origin` saja sudah cukup untuk membuat HTML yang
	// tidak dipercaya bisa membaca cookie sesi dan memanggil `/api/*`.
	test('bingkai tidak diberi kemampuan apa pun', () => {
		expect(HTML_SANDBOX).toBe('')
	})

	test('tidak pernah mengizinkan skrip atau asal yang sama', () => {
		expect(HTML_SANDBOX).not.toContain('allow-scripts')
		expect(HTML_SANDBOX).not.toContain('allow-same-origin')
	})

	test('jaringan ditutup CSP, lapis kedua di samping sandbox', () => {
		const html = sandboxDocument('<p>halo</p>')
		expect(html).toContain('Content-Security-Policy')
		expect(html).toContain("default-src 'none'")
	})

	// Yang boleh lolos hanya bahan yang tertanam sendiri - syarat supaya berkas
	// hasil ekspor utuh tanpa jaringan.
	test('gambar dan font hanya boleh dari URI data:', () => {
		const html = sandboxDocument('')
		expect(html).toContain('img-src data:')
		expect(html).toContain('font-src data:')
		expect(html).not.toContain('img-src *')
	})

	test('gaya sebaris tetap boleh supaya rancangannya bisa berwarna', () => {
		expect(sandboxDocument('')).toContain("style-src 'unsafe-inline'")
	})

	// Bingkai memakai `<body>`, pemotret memakai `<div>` di dalam
	// `<foreignObject>`. Nilainya harus sama, kalau tidak gambar hasil ekspor
	// berbeda dari yang dilihat penulis.
	test('dasar gaya dipakai bersama bingkai dan pemotret', () => {
		const html = sandboxDocument('')
		expect(html).toContain(`html, body { ${SANDBOX_ROOT_STYLE} }`)
		expect(html).toContain(SANDBOX_CONTENT_CSS)
		expect(SANDBOX_ROOT_STYLE).toContain('margin:0')
	})

	test('potongan HTML dibungkus menjadi dokumen utuh', () => {
		const html = sandboxDocument('<h1 style="color:red">Diskon</h1>')
		expect(html.startsWith('<!doctype html>')).toBe(true)
		expect(html).toContain('<h1 style="color:red">Diskon</h1>')
		expect(html.indexOf('<body>')).toBeLessThan(html.indexOf('<h1'))
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
})
