import { describe, expect, test } from 'bun:test'
import { cssLineHeight, type DocumentTypography, resolveHeadingStyle } from '@writer-hub/shared'
import { typographyRules } from './typography-css'

const skripsi: DocumentTypography = {
	baseFont: { family: '"Times New Roman", Times, serif', sizePt: 12 },
	lineHeight: 1.5,
	paragraph: { align: 'justify', firstLinePt: 28 },
	headings: {
		1: { sizePt: 12, align: 'center', spaceBeforePt: 12, spaceAfterPt: 6 },
		2: { sizePt: 12, spaceBeforePt: 12, spaceAfterPt: 0 },
	},
}

const kosong: DocumentTypography = {
	baseFont: { family: 'var(--font-document), serif', sizePt: 11 },
	lineHeight: 1.5,
}

/** Isi satu deklarasi di dalam aturan milik sebuah pemilih. */
function declaration(css: string, selector: string, property: string): string | null {
	const rule = css.split('\n').find((line) => line.startsWith(`${selector} {`))
	if (!rule) return null
	const found = rule.match(new RegExp(`(?:^|[{;])\\s*${property}:\\s*([^;]+)`))
	return found ? found[1].trim() : null
}

describe('lembar gaya tipografi', () => {
	test('badan naskah memakai keluarga dan ukuran dokumen', () => {
		const css = typographyRules(skripsi)
		expect(declaration(css, '.document-body', 'font-family')).toBe('"Times New Roman", Times, serif')
		expect(declaration(css, '.document-body', 'font-size')).toBe('12pt')
	})

	// Inti perbaikannya: judul BAB tidak lagi membesar mengikuti tangga web.
	test('judul BAB sebesar badan naskah dan rata tengah', () => {
		const css = typographyRules(skripsi)
		expect(declaration(css, '.document-body h1', 'font-size')).toBe('12pt')
		expect(declaration(css, '.document-body h1', 'text-align')).toBe('center')
		expect(declaration(css, '.document-body h2', 'font-size')).toBe('12pt')
	})

	test('indent baris pertama hanya untuk paragraf tingkat atas', () => {
		const css = typographyRules(skripsi)
		expect(declaration(css, '.document-body > p', 'text-indent')).toBe('28pt')
		expect(declaration(css, '.document-body > p', 'text-align')).toBe('justify')
	})

	// Dokumen tanpa tipografinya sendiri harus tampil seperti sebelum tangga
	// judul dipindahkan keluar dari `globals.css`: 1,9em dari badan 11pt.
	test('tanpa penimpa, tangga judul lama dipertahankan', () => {
		const css = typographyRules(kosong)
		expect(declaration(css, '.document-body h1', 'font-size')).toBe('20.9pt')
		expect(declaration(css, '.document-body h2', 'font-size')).toBe('16.5pt')
		expect(declaration(css, '.document-body h3', 'font-size')).toBe('13.42pt')
	})

	// Tingkat 7-9 tidak punya tag sendiri di HTML.
	test('judul tingkat 7-9 disasar lewat div berperan heading', () => {
		const css = typographyRules(kosong)
		expect(css).toContain(".document-body .heading[data-level='7'] {")
		expect(css).toContain(".document-body .heading[data-level='9'] {")
		expect(css).not.toContain('.document-body h7 {')
	})

	// Spasi dokumen bukan `line-height` CSS: 1,5 spasi tampil lebih longgar.
	test('spasi dokumen dikonversi ke line-height CSS', () => {
		const css = typographyRules(skripsi)
		expect(declaration(css, '.document-body', 'line-height')).toBe(String(cssLineHeight(1.5)))
		expect(cssLineHeight(1.5)).toBeGreaterThan(1.5)
	})
})

describe('hentian halaman di lembar gaya', () => {
	const berbab: DocumentTypography = {
		...skripsi,
		headings: { ...skripsi.headings, 1: { ...skripsi.headings?.[1], pageBreakBefore: true } },
	}

	// Paginasi kanvas punya jalurnya sendiri (`headingBreakLevels`); baris CSS
	// ini yang mengurus hasil cetak dan PDF.
	test('judul yang membuka lembar baru menyebutkannya di CSS', () => {
		const css = typographyRules(berbab)
		expect(declaration(css, '.document-body h1', 'break-before')).toBe('page')
	})

	test('tingkat lain tidak ikut', () => {
		const css = typographyRules(berbab)
		expect(declaration(css, '.document-body h2', 'break-before')).toBeNull()
	})

	test('template tanpa aturan itu tidak menulis apa pun', () => {
		expect(typographyRules(skripsi)).not.toContain('break-before')
	})
})

describe('penyelesaian gaya judul', () => {
	test('penimpa template menang atas tangga bawaan', () => {
		expect(resolveHeadingStyle(skripsi, 1).sizePt).toBe(12)
		expect(resolveHeadingStyle(kosong, 1).sizePt).toBe(20.9)
	})

	test('tingkat yang tidak disebut template tetap jatuh ke tangga bawaan', () => {
		// `skripsi` hanya menyebut tingkat 1 dan 2.
		expect(resolveHeadingStyle(skripsi, 3).sizePt).toBe(14.64)
	})

	test('judul selalu tebal kecuali template menyatakan sebaliknya', () => {
		expect(resolveHeadingStyle(kosong, 1).bold).toBe(true)
		expect(resolveHeadingStyle({ ...kosong, headings: { 1: { bold: false } } }, 1).bold).toBe(false)
	})
})
