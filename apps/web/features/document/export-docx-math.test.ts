import { describe, expect, test } from 'bun:test'
import type { JSONContent } from '@tiptap/core'
import { strFromU8, unzipSync } from 'fflate'
import { DEFAULT_PAGE_SETUP, pageGeometry } from '@/features/editor/page-geometry'
import { buildSchema } from '@/features/sync/serialize'
import { createXmlParser } from './docx/xml'
import { exportDocx } from './export-docx'
import { LatexToOmml, type MathIR } from './export-docx-math'

const parse = await createXmlParser()
const ir = (latex: string, display = true) => LatexToOmml.convert(latex, display, parse)

/** Nama elemen di seluruh pohon, urut kedalaman pertama. */
const names = (items: MathIR[] | null): string[] =>
	(items ?? []).flatMap((item) => (item.t === 'r' ? [] : [item.name, ...names(item.children)]))
const text = (items: MathIR[] | null): string =>
	(items ?? []).map((item) => (item.t === 'r' ? item.text : text(item.children))).join('')

describe('LaTeX → bentuk antara OMML', () => {
	test('pecahan, akar, dan akar berpangkat', () => {
		expect(names(ir('\\frac{a}{b}'))).toContain('m:f')
		expect(names(ir('\\sqrt{x}'))).toContain('m:rad')
		const root = ir('\\sqrt[3]{8}')
		expect(text(root)).toBe('38')
	})

	test('sigma menjadi m:nary ∑ dengan batas dan isinya sampai tanda sama dengan', () => {
		const items = ir('\\sum_{i=1}^{n} i^2 = x')
		const nary = items?.[0]
		expect(nary?.t === 'el' && nary.name).toBe('m:nary')
		expect(JSON.stringify(nary)).toContain('"m:val":"∑"')
		expect(JSON.stringify(nary)).toContain('m:sSup')
		// "= x" di luar operator.
		expect(items?.at(-1)).toMatchObject({ t: 'r', text: '=x' })
	})

	test('integral bertumpu sub/sup, isinya sampai akhir', () => {
		const nary = ir('\\int_0^1 x^2 \\, dx')?.[0]
		expect(JSON.stringify(nary)).toContain('"m:val":"subSup"')
		expect(JSON.stringify(nary)).toContain('"m:val":"∫"')
	})

	test('matriks 2×2 dalam kurung menjadi m:d berisi m:m dua baris', () => {
		const items = ir('\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}')
		expect(names(items).slice(0, 2)).toEqual(['m:d', 'm:dPr'])
		expect(names(items).filter((name) => name === 'm:mr')).toHaveLength(2)
		expect(text(items)).toBe('abcd')
	})

	test('indeks ganda dan limit fungsi', () => {
		expect(names(ir('x_i^2'))).toContain('m:sSubSup')
		const limit = ir('\\lim_{x \\to 0} \\frac{\\sin x}{x}')
		expect(names(limit)).toEqual(expect.arrayContaining(['func', 'm:limLow', 'm:f']))
	})

	test('aksen, garis atas, kurung nilai mutlak, cases, aligned', () => {
		expect(names(ir('\\hat{x}'))).toContain('m:acc')
		expect(names(ir('\\overline{AB}'))).toContain('m:bar')
		expect(JSON.stringify(ir('\\left| x \\right|'))).toContain('"m:val":"|"')
		const cases = ir('f(x) = \\begin{cases} 1 & x > 0 \\\\ 0 & \\text{lainnya} \\end{cases}')
		expect(names(cases)).toEqual(expect.arrayContaining(['m:d', 'm:m']))
		const aligned = ir('\\begin{aligned} a &= b \\\\ c &= d \\end{aligned}')
		expect(names(aligned)[0]).toBe('m:eqArr')
		expect(JSON.stringify(aligned)).toContain('"aln":true')
	})

	test('teks dalam rumus menjadi run teks biasa (m:nor)', () => {
		const items = ir('x \\text{ jika } y')
		expect(items?.some((item) => item.t === 'r' && item.nor && item.text.includes('jika'))).toBe(true)
	})

	test('LaTeX rusak atau kosong tidak terpetakan', () => {
		expect(ir('\\frac{1}{2')).toBeNull()
		expect(ir('   ')).toBeNull()
	})
})

describe('rumus di berkas DOCX (OBJ-2)', () => {
	async function exported(content: JSONContent[]) {
		const doc = buildSchema().nodeFromJSON({ type: 'doc', content })
		const blob = await exportDocx(doc, {
			title: 'uji',
			geometry: pageGeometry(DEFAULT_PAGE_SETUP),
			setup: DEFAULT_PAGE_SETUP,
		})
		const bytes = new Uint8Array(await blob.arrayBuffer())
		return { bytes, xml: strFromU8(unzipSync(bytes)['word/document.xml']) }
	}

	test('rumus inline menjadi m:oMath di dalam paragrafnya, teks sekitarnya utuh', async () => {
		const { xml } = await exported([
			{
				type: 'paragraph',
				content: [
					{ type: 'text', text: 'Rumus ' },
					{ type: 'mathInline', attrs: { latex: 'E=mc^2' } },
					{ type: 'text', text: ' di tengah.' },
				],
			},
		])
		const paragraph = xml.slice(xml.indexOf('Rumus'), xml.indexOf('di tengah'))
		expect(paragraph).toContain('<m:oMath>')
		expect(paragraph).toContain('<m:sSup>')
		expect(xml).not.toContain('<m:oMathPara>')
	})

	test('rumus blok menjadi m:oMathPara rata tengah', async () => {
		const { xml } = await exported([{ type: 'mathBlock', attrs: { latex: '\\int_0^1 x^2 \\, dx' } }])
		expect(xml).toContain('<m:oMathPara>')
		expect(xml).toContain('<m:jc m:val="center"/>')
		expect(xml).toContain('<m:nary>')
		// m:sub dan m:sup selalu ada (wajib di skema OMML).
		expect(xml).toMatch(/<m:nary>[\s\S]*<m:sub>[\s\S]*<m:sup>[\s\S]*<m:e>/)
	})

	test('LaTeX yang tidak terpetakan jatuh ke teks lebar-tetap, tidak hilang', async () => {
		const { xml } = await exported([{ type: 'mathBlock', attrs: { latex: '\\frac{1}{2' } }])
		expect(xml).not.toContain('<m:oMath>')
		expect(xml).toContain('\\frac{1}{2')
		expect(xml).toContain('Consolas')
	})

	test('putar-balik: rumus yang diekspor diimpor kembali sebagai rumus', async () => {
		const { readDocx } = await import('./docx')
		const { bytes } = await exported([
			{ type: 'mathBlock', attrs: { latex: '\\frac{a}{b} + \\sqrt{x}' } },
			{
				type: 'paragraph',
				content: [
					{ type: 'text', text: 'dan ' },
					{ type: 'mathInline', attrs: { latex: 'x_i^2' } },
				],
			},
		])
		const round = await readDocx(bytes)
		const json = JSON.stringify(round.content)
		expect(json).toContain('"type":"mathBlock"')
		expect(json).toContain('"type":"mathInline"')
		expect(json).toContain('\\\\frac{a}{b}')
		expect(json).toContain('\\\\sqrt{x}')
	})
})
