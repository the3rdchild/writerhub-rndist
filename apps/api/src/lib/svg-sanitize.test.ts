import { describe, expect, test } from 'bun:test'
import { sanitizeSvg } from './svg-sanitize'

const wrap = (inner: string) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10">${inner}</svg>`

describe('sanitizeSvg', () => {
	test('menolak berkas yang bukan SVG', () => {
		expect(sanitizeSvg('<html><body>halo</body></html>')).toBeNull()
		expect(sanitizeSvg('')).toBeNull()
	})

	test('membiarkan gambar yang wajar apa adanya', () => {
		const source = wrap('<circle cx="5" cy="5" r="4" fill="#f00"/>')
		const result = sanitizeSvg(source)
		expect(result?.svg).toContain('<circle')
		expect(result?.svg).toContain('#f00')
		expect(result?.removed).toEqual([])
	})

	test('membuang <script> beserta isinya', () => {
		const result = sanitizeSvg(wrap('<script>alert(1)</script><rect/>'))
		expect(result?.svg).not.toContain('alert')
		expect(result?.svg).not.toContain('<script')
		expect(result?.svg).toContain('<rect')
		expect(result?.removed).toContain('<script>')
	})

	test('membuang skrip yang menutup sendiri', () => {
		const result = sanitizeSvg(wrap('<script href="data:text/javascript,alert(1)"/>'))
		expect(result?.svg).not.toContain('<script')
	})

	test('membuang penangan sebaris', () => {
		const result = sanitizeSvg(wrap('<rect onload="alert(1)" onclick=\'x()\' fill="#0f0"/>'))
		expect(result?.svg).not.toContain('onload')
		expect(result?.svg).not.toContain('onclick')
		// Atribut yang sah di elemen yang sama tidak ikut terbawa.
		expect(result?.svg).toContain('fill="#0f0"')
		expect(result?.removed).toContain('atribut on*')
	})

	test('membuang <foreignObject>, tempat HTML menyelinap masuk', () => {
		const result = sanitizeSvg(
			wrap('<foreignObject><body xmlns="http://www.w3.org/1999/xhtml">x</body></foreignObject>'),
		)
		expect(result?.svg).not.toContain('foreignObject')
	})

	test('memutus rujukan keluar tapi menyimpan yang menunjuk ke dalam berkas', () => {
		const result = sanitizeSvg(
			wrap(
				'<use href="#icon"/><image href="https://contoh.test/a.png"/><a xlink:href="javascript:alert(1)">x</a>',
			),
		)
		expect(result?.svg).toContain('href="#icon"')
		expect(result?.svg).not.toContain('contoh.test')
		expect(result?.svg).not.toContain('javascript:')
		expect(result?.removed).toContain('rujukan luar')
	})

	test('membiarkan gambar tertanam ber-URI data:', () => {
		const png = 'data:image/png;base64,iVBORw0KGgo='
		const result = sanitizeSvg(wrap(`<image href="${png}"/>`))
		expect(result?.svg).toContain(png)
	})

	/*
	 * Komentar dibuang lebih dulu justru karena inilah bentuk yang paling
	 * menipu: potongan yang baru menyatu jadi tag utuh setelah aturan lain
	 * berjalan.
	 */
	test('membuang komentar dan CDATA sebelum aturan lain berjalan', () => {
		const result = sanitizeSvg(wrap('<!-- <script>alert(1)</script> --><rect/>'))
		expect(result?.svg).not.toContain('alert')
		expect(result?.svg).not.toContain('<!--')
	})

	test('memutus url() yang menunjuk keluar berkas', () => {
		const result = sanitizeSvg(wrap('<rect style="fill:url(https://contoh.test/a.svg#x)"/>'))
		expect(result?.svg).not.toContain('contoh.test')
	})

	test('daftar buangan tidak mengulang jenis yang sama', () => {
		const result = sanitizeSvg(wrap('<rect onload="a()"/><rect onclick="b()"/>'))
		expect(result?.removed).toEqual(['atribut on*'])
	})
})
