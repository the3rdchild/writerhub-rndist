/*
 * Temuan uji editor 2 Okt (jalur A · Ekspor DOCX): setiap temuan diperiksa di
 * XML berkas hasil ekspor. Satu `describe` per temuan.
 */
import { describe, expect, test } from 'bun:test'
import type { JSONContent } from '@tiptap/core'
import type { DocumentTypography } from '@writer-hub/shared'
import { strFromU8, unzipSync } from 'fflate'
import { DEFAULT_PAGE_SETUP, type PageSetup, pageGeometry } from '@/features/editor/page-geometry'
import { buildSchema } from '@/features/sync/serialize'
import { exportDocx, lineSpacingOf } from './export-docx'

async function exported(
	content: JSONContent[],
	options: { setup?: PageSetup; typography?: DocumentTypography; furniture?: object } = {},
) {
	const setup = options.setup ?? DEFAULT_PAGE_SETUP
	const doc = buildSchema().nodeFromJSON({ type: 'doc', content })
	const blob = await exportDocx(doc, {
		title: 'uji',
		geometry: pageGeometry(setup),
		setup,
		...(options.typography ? { typography: options.typography } : {}),
		...(options.furniture ? { furniture: options.furniture as never } : {}),
	})
	const bytes = new Uint8Array(await blob.arrayBuffer())
	const files = Object.fromEntries(
		Object.entries(unzipSync(bytes))
			.filter(([name]) => name.endsWith('.xml') || name.endsWith('.rels'))
			.map(([name, data]) => [name, strFromU8(data)]),
	)
	return { bytes, files, xml: files['word/document.xml'] }
}

const text = (value: string, marks?: JSONContent['marks']): JSONContent => ({
	type: 'text',
	text: value,
	...(marks ? { marks } : {}),
})
const paragraph = (value: string, attrs?: Record<string, unknown>): JSONContent => ({
	type: 'paragraph',
	...(attrs ? { attrs } : {}),
	content: value ? [text(value)] : [],
})

/** XML paragraf Word yang memuat penanda itu. */
const paragraphWith = (xml: string, marker: string) => {
	const at = xml.indexOf(marker)
	const start = Math.max(xml.lastIndexOf('<w:p>', at), xml.lastIndexOf('<w:p ', at))
	return xml.slice(start, xml.indexOf('</w:p>', at) + 6)
}

/** XML run Word (`w:r`) yang memuat teks itu. */
const runWith = (xml: string, marker: string) => {
	const at = xml.indexOf(`>${marker}<`)
	return xml.slice(xml.lastIndexOf('<w:r>', at), xml.indexOf('</w:r>', at) + 6)
}

describe('TKS-4 (+OBJ-20): format karakter ikut ke DOCX', () => {
	test('jenis, ukuran, dan warna huruf dari textStyle', async () => {
		const { xml } = await exported([
			{
				type: 'paragraph',
				content: [
					text('Georgia', [{ type: 'textStyle', attrs: { fontFamily: 'Georgia, serif' } }]),
					text(' '),
					text('besar18', [{ type: 'textStyle', attrs: { fontSize: '18pt' } }]),
					text(' '),
					text('merah', [{ type: 'textStyle', attrs: { color: '#e11d48' } }]),
				],
			},
		])
		expect(runWith(xml, 'Georgia')).toContain('w:ascii="Georgia"')
		expect(runWith(xml, 'besar18')).toContain('<w:sz w:val="36"/>')
		expect(runWith(xml, 'merah')).toContain('<w:color w:val="E11D48"/>')
	})

	test('sorotan: palet Word → w:highlight, warna kanvas → w:shd persis', async () => {
		const { xml } = await exported([
			{
				type: 'paragraph',
				content: [
					text('stabilo', [{ type: 'highlight', attrs: { color: '#ffff00' } }]),
					text(' '),
					text('pastel', [{ type: 'highlight', attrs: { color: '#fef08a' } }]),
				],
			},
		])
		expect(runWith(xml, 'stabilo')).toContain('<w:highlight w:val="yellow"/>')
		expect(runWith(xml, 'pastel')).toMatch(/<w:shd [^>]*w:fill="FEF08A"/)
	})

	test('sub/superskrip menjadi w:vertAlign', async () => {
		const { xml } = await exported([
			{
				type: 'paragraph',
				content: [
					text('H'),
					text('2', [{ type: 'subscript' }]),
					text('O x'),
					text('3', [{ type: 'superscript' }]),
				],
			},
		])
		expect(runWith(xml, '2')).toContain('<w:vertAlign w:val="subscript"/>')
		expect(runWith(xml, '3')).toContain('<w:vertAlign w:val="superscript"/>')
	})

	test('kode dalam baris berhuruf lebar-tetap dan berlatar (OBJ-20)', async () => {
		const { xml } = await exported([{ type: 'paragraph', content: [text('halo()', [{ type: 'code' }])] }])
		expect(runWith(xml, 'halo()')).toContain('w:ascii="Consolas"')
		expect(runWith(xml, 'halo()')).toContain('<w:shd ')
	})

	test('tautan menjadi w:hyperlink eksternal; tanpa skema diberi https://', async () => {
		const { xml, files } = await exported([
			{
				type: 'paragraph',
				content: [
					text('tautan', [{ type: 'link', attrs: { href: 'https://contoh.id/a' } }]),
					text(' dan '),
					text('situs', [{ type: 'link', attrs: { href: 'www.contoh.com' } }]),
					text(' dan '),
					text('jahat', [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }]),
				],
			},
		])
		expect(xml.match(/<w:hyperlink /g) ?? []).toHaveLength(2)
		expect(runWith(xml, 'tautan')).toContain('<w:rStyle w:val="Hyperlink"/>')
		const rels = files['word/_rels/document.xml.rels']
		expect(rels).toContain('Target="https://contoh.id/a"')
		expect(rels).toContain('Target="https://www.contoh.com"')
		expect(rels).not.toContain('javascript')
		expect(xml).toContain('>jahat<')
	})

	test('run bertaut berurutan dengan alamat sama menjadi satu hyperlink', async () => {
		const href = 'https://contoh.id'
		const { xml } = await exported([
			{
				type: 'paragraph',
				content: [
					text('satu ', [{ type: 'link', attrs: { href } }]),
					text('dua', [{ type: 'link', attrs: { href } }, { type: 'bold' }]),
				],
			},
		])
		expect(xml.match(/<w:hyperlink /g) ?? []).toHaveLength(1)
	})
})

describe('TKS-5: daftar centang, callout, kutipan', () => {
	const task = (checked: boolean, value: string, ...rest: JSONContent[]): JSONContent => ({
		type: 'taskItem',
		attrs: { checked },
		content: [paragraph(value), ...rest],
	})

	test('satu paragraf per butir centang, dengan kotak w14:checkbox dan statusnya', async () => {
		const { xml } = await exported([
			{ type: 'taskList', content: [task(true, 'tugas selesai'), task(false, 'tugas belum')] },
		])
		expect(xml).not.toContain('tugas selesaitugas belum')
		const done = paragraphWith(xml, 'tugas selesai')
		const open = paragraphWith(xml, 'tugas belum')
		expect(done).toContain('<w14:checked w14:val="1"/>')
		expect(done).toContain('☒')
		expect(open).toContain('<w14:checked w14:val="0"/>')
		expect(open).toContain('☐')
		// Butir selesai dicoret, seperti di kanvas.
		expect(runWith(xml, 'tugas selesai')).toContain('<w:strike/>')
		expect(runWith(xml, 'tugas belum')).not.toContain('<w:strike/>')
	})

	test('centang bersarang menjorok lebih dalam', async () => {
		const { xml } = await exported([
			{
				type: 'taskList',
				content: [task(false, 'induk', { type: 'taskList', content: [task(false, 'anak')] })],
			},
		])
		const left = (marker: string) => Number(/w:left="(\d+)"/.exec(paragraphWith(xml, marker))?.[1])
		expect(left('anak')).toBeGreaterThan(left('induk'))
	})

	test('callout: kotak berlatar dan bergaris kiri yang menjaga paragraf dan daftarnya', async () => {
		const { xml } = await exported([
			{
				type: 'callout',
				attrs: { calloutType: 'info', emoji: 'ℹ️' },
				content: [
					paragraph('Isi callout dari menu Sisip'),
					paragraph('baris kedua callout'),
					{
						type: 'bulletList',
						content: [{ type: 'listItem', content: [paragraph('poin dalam callout')] }],
					},
				],
			},
		])
		expect(xml).not.toContain('Sisipbaris')
		const box = /<w:tbl>[\s\S]*?<\/w:tbl>/.exec(xml)?.[0] ?? ''
		expect(box).toContain('Isi callout dari menu Sisip')
		expect(box).toContain('baris kedua callout')
		expect(paragraphWith(box, 'poin dalam callout')).toContain('<w:numPr>')
		expect(box).toMatch(/<w:shd [^>]*w:fill="EFF5FE"/)
		expect(box).toMatch(/<w:left w:val="single" w:color="3B82F6"/)
		expect(paragraphWith(box, 'Isi callout')).toContain('ℹ️')
	})

	test('dua callout berurutan tidak dilebur Word menjadi satu tabel', async () => {
		const callout = (value: string): JSONContent => ({ type: 'callout', content: [paragraph(value)] })
		const { xml } = await exported([callout('satu'), callout('dua')])
		expect(xml).not.toContain('</w:tbl><w:tbl>')
	})

	test('kutipan: gaya Quote, menjorok, bergaris kiri, miring, isi daftarnya ikut menjorok', async () => {
		const { xml } = await exported([
			{
				type: 'blockquote',
				content: [
					paragraph('kutipan panjang'),
					{
						type: 'orderedList',
						content: [{ type: 'listItem', content: [paragraph('nomor dalam kutipan')] }],
					},
				],
			},
		])
		const quote = paragraphWith(xml, 'kutipan panjang')
		expect(quote).toContain('<w:pStyle w:val="Quote"/>')
		expect(quote).toMatch(/<w:ind w:left="270"/)
		expect(quote).toMatch(/<w:pBdr><w:left w:val="single"/)
		expect(runWith(xml, 'kutipan panjang')).toContain('<w:i/>')
		const listed = paragraphWith(xml, 'nomor dalam kutipan')
		expect(listed).toContain('<w:numPr>')
		expect(Number(/w:left="(\d+)"/.exec(listed)?.[1])).toBeGreaterThan(270)
	})
})

describe('TKS-6: spasi baris persen', () => {
	test('"200%" adalah kelipatan 2, bukan 200', () => {
		expect(lineSpacingOf('200%')).toEqual({ line: Math.round((2 / 1.15) * 240), lineRule: 'auto' })
		expect(lineSpacingOf('1.725')).toEqual({ line: 360, lineRule: 'auto' })
		expect(lineSpacingOf('24px')).toEqual({ line: 360, lineRule: 'exact' })
		expect(lineSpacingOf('18pt')).toEqual({ line: 360, lineRule: 'exact' })
		expect(lineSpacingOf('normal')).toBeNull()
	})

	test('paragraf tempelan Word berspasi 200% tidak lagi w:line="41739"', async () => {
		const { xml } = await exported([paragraph('ganda', { lineHeight: '200%' })])
		const spacing = /<w:spacing [^>]*w:line="(\d+)"/.exec(paragraphWith(xml, 'ganda'))
		expect(Number(spacing?.[1])).toBe(417)
		expect(xml).not.toContain('41739')
	})
})

describe('lekukan paragraf dan daftar', () => {
	const skripsi: DocumentTypography = {
		baseFont: { family: '"Times New Roman", Times, serif', sizePt: 12 },
		lineHeight: 1.5,
		paragraph: { align: 'justify', firstLinePt: 28 },
	}

	test('paragraf tanpa lekukan tidak menimpa lekukan baris pertama gaya dokumen', async () => {
		const { xml } = await exported([paragraph('badan naskah')], { typography: skripsi })
		expect(paragraphWith(xml, 'badan naskah')).not.toContain('<w:ind')
	})

	test('paragraf di sel tabel tidak mewarisi lekukan dan rata kanan-kiri badan naskah', async () => {
		const { xml } = await exported(
			[
				{
					type: 'table',
					content: [{ type: 'tableRow', content: [{ type: 'tableCell', content: [paragraph('sel')] }] }],
				},
			],
			{ typography: skripsi },
		)
		const cellParagraph = paragraphWith(xml, '>sel<')
		expect(cellParagraph).toMatch(/<w:ind [^>]*w:firstLine="0"/)
		expect(cellParagraph).toContain('<w:jc w:val="left"/>')
	})

	test('daftar bertingkat menjorok per tingkat; paragraf kedua butir tanpa nomor', async () => {
		const { xml } = await exported([
			{
				type: 'bulletList',
				content: [
					{
						type: 'listItem',
						content: [
							paragraph('induk'),
							paragraph('lanjutan induk'),
							{ type: 'bulletList', content: [{ type: 'listItem', content: [paragraph('anak')] }] },
						],
					},
				],
			},
		])
		const left = (marker: string) => Number(/w:left="(\d+)"/.exec(paragraphWith(xml, marker))?.[1])
		expect(left('induk')).toBe(360)
		expect(left('anak')).toBe(720)
		expect(paragraphWith(xml, '>lanjutan induk<')).not.toContain('<w:numPr>')
		expect(left('lanjutan induk')).toBe(360)
	})
})
