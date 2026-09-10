import { describe, expect, test } from 'bun:test'
import { isAllowedAttribute, isAllowedElement } from './diagram-allowlist'

describe('elemen', () => {
	test('kosakata gambar diloloskan', () => {
		for (const name of ['svg', 'g', 'path', 'rect', 'text', 'marker', 'use', 'title', 'desc']) {
			expect(isAllowedElement(name)).toBe(true)
		}
	})

	/*
	 * Empat penolakan ini yang menahan seluruh permukaan serangannya, jadi
	 * masing-masing diuji sendiri - kalau salah satu longgar, alasannya harus
	 * terbaca dari nama tesnya yang gagal.
	 */
	test('foreignObject ditolak: ia menyelundupkan HTML utuh', () => {
		expect(isAllowedElement('foreignObject')).toBe(false)
	})

	test('style ditolak: CSS di dalam SVG tidak ter-scope', () => {
		expect(isAllowedElement('style')).toBe(false)
	})

	test('image ditolak: satu-satunya jalan memuat sumber daya jauh', () => {
		expect(isAllowedElement('image')).toBe(false)
	})

	test('elemen animasi ditolak: ia mengubah atribut sesudah penyaringan lewat', () => {
		expect(isAllowedElement('animate')).toBe(false)
		expect(isAllowedElement('animateTransform')).toBe(false)
		expect(isAllowedElement('set')).toBe(false)
	})

	test('script dan a ditolak', () => {
		expect(isAllowedElement('script')).toBe(false)
		expect(isAllowedElement('a')).toBe(false)
	})
})

describe('atribut', () => {
	test('gaya dan geometri diloloskan', () => {
		expect(isAllowedAttribute('fill', '#eb6c36')).toBe(true)
		expect(isAllowedAttribute('stroke-dasharray', '4,3')).toBe(true)
		expect(isAllowedAttribute('font-family', "'Geist Mono', monospace")).toBe(true)
		expect(isAllowedAttribute('viewBox', '0 0 1000 480')).toBe(true)
	})

	test('penangan kejadian ditolak berapa pun bentuknya', () => {
		expect(isAllowedAttribute('onload', 'alert(1)')).toBe(false)
		expect(isAllowedAttribute('onclick', 'alert(1)')).toBe(false)
		expect(isAllowedAttribute('ONERROR', 'alert(1)')).toBe(false)
	})

	test('data-* dan aria-* diloloskan, keduanya inert tanpa skrip', () => {
		expect(isAllowedAttribute('data-value', '128')).toBe(true)
		expect(isAllowedAttribute('aria-labelledby', 'x-title')).toBe(true)
	})

	test('atribut tak dikenal ditolak, bukan diloloskan', () => {
		expect(isAllowedAttribute('formaction', '#')).toBe(false)
		expect(isAllowedAttribute('srcdoc', '<p>x</p>')).toBe(false)
	})
})

describe('rujukan yang harus lokal', () => {
	test('mata panah dan pola boleh menunjuk ke dalam berkas', () => {
		expect(isAllowedAttribute('marker-end', 'url(#arrow)')).toBe(true)
		expect(isAllowedAttribute('clip-path', 'url(#clip-1)')).toBe(true)
		expect(isAllowedAttribute('mask', 'none')).toBe(true)
	})

	test('rujukan ke luar ditolak', () => {
		expect(isAllowedAttribute('marker-end', 'url(https://evil.test/a.svg#x)')).toBe(false)
		expect(isAllowedAttribute('clip-path', 'url(//evil.test/a#x)')).toBe(false)
	})

	test('rujukan berantai diperiksa seluruhnya', () => {
		expect(isAllowedAttribute('marker-end', 'url(#a) url(#b)')).toBe(true)
		expect(isAllowedAttribute('marker-end', 'url(#a) url(https://evil.test#b)')).toBe(false)
	})
})

describe('href', () => {
	test('hanya fragmen sedokumen', () => {
		expect(isAllowedAttribute('href', '#icon-file')).toBe(true)
		expect(isAllowedAttribute('xlink:href', '#icon-file')).toBe(true)
	})

	test('skema apa pun ditolak', () => {
		expect(isAllowedAttribute('href', 'javascript:alert(1)')).toBe(false)
		expect(isAllowedAttribute('href', 'https://evil.test/a.svg')).toBe(false)
		expect(isAllowedAttribute('xlink:href', 'data:image/svg+xml,<svg/>')).toBe(false)
	})
})

describe('style sebaris', () => {
	test('gaya biasa diloloskan - ia tidak punya selektor, jadi tidak bisa bocor', () => {
		expect(isAllowedAttribute('style', 'fill:#2d3142;font-size:12px')).toBe(true)
	})

	test('skema dan impor ditolak', () => {
		expect(isAllowedAttribute('style', 'background:url(javascript:alert(1))')).toBe(false)
		expect(isAllowedAttribute('style', '@import url(https://evil.test/a.css)')).toBe(false)
		expect(isAllowedAttribute('style', 'width:expression(alert(1))')).toBe(false)
	})

	test('rujukan gambar ke luar ditolak, ke dalam berkas diterima', () => {
		expect(isAllowedAttribute('style', 'fill:url(https://evil.test/a.svg#p)')).toBe(false)
		expect(isAllowedAttribute('style', 'fill:url(#dots)')).toBe(true)
	})
})
