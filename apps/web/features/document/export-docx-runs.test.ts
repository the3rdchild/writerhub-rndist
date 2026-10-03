import { describe, expect, test } from 'bun:test'
import { buildSchema } from '@/features/sync/serialize'
import {
	CODE_FONT,
	cssColorToHex,
	externalLinkOf,
	fontNameOf,
	fontSizeHalfPoints,
	runStyleOf,
	wordHighlightOf,
} from './export-docx-runs'

describe('warna CSS → hex Word', () => {
	test('hex pendek, panjang, dan nama warna', () => {
		expect(cssColorToHex('#e11d48')).toBe('E11D48')
		expect(cssColorToHex('#f00')).toBe('FF0000')
		expect(cssColorToHex('red')).toBe('FF0000')
		expect(cssColorToHex('FF8800')).toBe('FF8800')
	})

	test('rgb/rgba/hsl - alfa ditumpuk di atas kertas putih', () => {
		expect(cssColorToHex('rgb(187, 247, 208)')).toBe('BBF7D0')
		// rgba(15,23,42,.04) = --overlay-hover kanvas di atas putih.
		expect(cssColorToHex('rgba(15, 23, 42, 0.04)')).toBe('F5F6F6')
		expect(cssColorToHex('hsl(0, 100%, 50%)')).toBe('FF0000')
	})

	test('transparan, variabel CSS, dan sampah menjadi null', () => {
		expect(cssColorToHex('transparent')).toBeNull()
		expect(cssColorToHex('var(--accent)')).toBeNull()
		expect(cssColorToHex('rgba(0,0,0,0)')).toBeNull()
		expect(cssColorToHex('bukan-warna')).toBeNull()
		expect(cssColorToHex(null)).toBeNull()
	})
})

describe('sorotan Word', () => {
	test('hanya warna palet Word yang menjadi w:highlight', () => {
		expect(wordHighlightOf('FFFF00')).toBe('yellow')
		expect(wordHighlightOf('00FF00')).toBe('green')
		// Kuning pastel kanvas bukan kuning stabilo: tetap arsiran warna persisnya.
		expect(wordHighlightOf('FEF08A')).toBeNull()
	})
})

describe('huruf dan ukuran', () => {
	test('tumpukan katalog memakai labelnya, webfont tanpa var()', () => {
		expect(fontNameOf('Georgia, serif')).toBe('Georgia')
		expect(fontNameOf('var(--font-lato), sans-serif')).toBe('Lato')
		expect(fontNameOf('"Times New Roman", Times, serif')).toBe('Times New Roman')
		expect(fontNameOf('"Fira Sans", sans-serif')).toBe('Fira Sans')
	})

	test('tumpukan generik saja tidak menamai huruf', () => {
		expect(fontNameOf('serif')).toBeNull()
		expect(fontNameOf('var(--tidak-dikenal), sans-serif')).toBeNull()
		expect(fontNameOf('')).toBeNull()
	})

	test('ukuran pt, px, em, dan persen menjadi setengah titik', () => {
		expect(fontSizeHalfPoints('18pt')).toBe(36)
		expect(fontSizeHalfPoints('24px')).toBe(36)
		expect(fontSizeHalfPoints('1.5em', 12)).toBe(36)
		expect(fontSizeHalfPoints('150%', 12)).toBe(36)
		expect(fontSizeHalfPoints('besar')).toBeNull()
	})
})

describe('alamat tautan', () => {
	test('skema aman dipakai apa adanya', () => {
		expect(externalLinkOf('https://contoh.id/a?b=1')).toBe('https://contoh.id/a?b=1')
		expect(externalLinkOf('mailto:a@b.id')).toBe('mailto:a@b.id')
	})

	test('nama domain tanpa skema diberi https://', () => {
		expect(externalLinkOf('www.contoh.com')).toBe('https://www.contoh.com')
		expect(externalLinkOf('contoh.co.id/hal')).toBe('https://contoh.co.id/hal')
		expect(externalLinkOf('contoh.com:8080/x')).toBe('https://contoh.com:8080/x')
	})

	test('jangkar, jalur relatif, berkas, dan skema berbahaya bukan hyperlink', () => {
		expect(externalLinkOf('#toc-h-12')).toBeNull()
		expect(externalLinkOf('/library')).toBeNull()
		expect(externalLinkOf('laporan.pdf')).toBeNull()
		expect(externalLinkOf('javascript:alert(1)')).toBeNull()
		expect(externalLinkOf('data:text/html,x')).toBeNull()
	})
})

describe('mark → properti run', () => {
	const schema = buildSchema()
	const marks = (...items: [string, Record<string, unknown>?][]) =>
		items.map(([name, attrs]) => schema.marks[name].create(attrs))

	test('semua mark berpadanan ikut', () => {
		const style = runStyleOf(
			marks(
				['bold'],
				['italic'],
				['underline'],
				['strike'],
				['superscript'],
				['textStyle', { color: '#e11d48', fontFamily: 'Georgia, serif', fontSize: '18pt' }],
			),
		)
		expect(style).toMatchObject({
			bold: true,
			italics: true,
			underline: {},
			strike: true,
			superScript: true,
			color: 'E11D48',
			font: 'Georgia',
			size: 36,
		})
	})

	test('sorotan palet → highlight, warna lain → arsiran persis', () => {
		expect(runStyleOf(marks(['highlight', { color: '#ffff00' }])).highlight).toBe('yellow')
		expect(runStyleOf(marks(['highlight', { color: '#fef08a' }])).shading?.fill).toBe('FEF08A')
		expect(runStyleOf(marks(['highlight'])).highlight).toBe('yellow')
	})

	test('kode: huruf lebar-tetap berlatar, menang atas huruf textStyle', () => {
		const style = runStyleOf(marks(['code'], ['textStyle', { fontFamily: 'Georgia, serif' }]))
		expect(style.font).toBe(CODE_FONT)
		expect(style.shading?.fill).toBeDefined()
	})

	test('rupa warisan wadah kalah dari mark teks itu sendiri', () => {
		const style = runStyleOf(marks(['textStyle', { color: '#2563eb' }]), { italics: true, color: '4B5563' })
		expect(style).toMatchObject({ italics: true, color: '2563EB' })
	})

	test('fontWeight tebal dari textStyle', () => {
		expect(runStyleOf(marks(['textStyle', { fontWeight: '700' }])).bold).toBe(true)
		expect(runStyleOf(marks(['textStyle', { fontWeight: 'normal' }])).bold).toBeUndefined()
	})
})
