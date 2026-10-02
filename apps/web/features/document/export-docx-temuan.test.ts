/*
 * Temuan uji editor 2 Okt (jalur A · Ekspor DOCX): setiap temuan diperiksa di
 * XML berkas hasil ekspor. Satu `describe` per temuan.
 */
import { describe, expect, test } from 'bun:test'
import type { JSONContent } from '@tiptap/core'
import type { DocumentTypography, Watermark } from '@writer-hub/shared'
import { strFromU8, unzipSync } from 'fflate'
import { DEFAULT_PAGE_SETUP, type PageSetup, pageGeometry } from '@/features/editor/page-geometry'
import { buildSchema } from '@/features/sync/serialize'
import { exportDocx, lineSpacingOf } from './export-docx'
import { applyWatermarkAlpha, attachSectionBreaks } from './export-docx-post'

const PNG_1PX =
	'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
const EMU_PER_PX = 9525

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

describe('OBJ-14: gambar lebih tinggi dari halaman diperkecil proporsional', () => {
	test('600×2400 di A4 muat setinggi area isi, rasionya tetap', async () => {
		const { xml } = await exported([{ type: 'image', attrs: { src: PNG_1PX, width: 600, height: 2400 } }])
		const match = /<wp:extent cx="(\d+)" cy="(\d+)"/.exec(xml)
		const width = Number(match?.[1]) / EMU_PER_PX
		const height = Number(match?.[2]) / EMU_PER_PX
		expect(height).toBeLessThanOrEqual(pageGeometry(DEFAULT_PAGE_SETUP).contentHeight)
		expect(height / width).toBeCloseTo(4, 1)
		// Spasi tunggal: kelipatan spasi dokumen tidak memanjangkan baris gambar.
		expect(paragraphWith(xml, '<w:drawing>')).toMatch(/<w:spacing [^>]*w:line="240"/)
	})
})

describe('KOL-12: watermark di header Word', () => {
	const watermark = (patch: Partial<Watermark>): Watermark => ({
		kind: 'text',
		text: 'RAHASIA',
		anchor: 'center',
		offsetX: 0,
		offsetY: 0,
		scale: 0.6,
		opacity: 0.15,
		rotation: -45,
		...patch,
	})
	const headersOf = (files: Record<string, string>) =>
		Object.entries(files)
			.filter(([name]) => /^word\/header\d+\.xml$/.test(name))
			.map(([, xml]) => xml)

	test('watermark teks: WordArt VML di belakang teks, diputar, tembus pandang', async () => {
		const { files } = await exported([paragraph('isi')], {
			setup: { ...DEFAULT_PAGE_SETUP, watermark: watermark({}) },
		})
		const headers = headersOf(files)
		expect(headers.length).toBeGreaterThan(0)
		const xml = headers[0]
		expect(xml).toContain('id="PowerPlusWaterMarkObject1"')
		expect(xml).toContain('string="RAHASIA"')
		expect(xml).toContain('rotation:315')
		expect(xml).toMatch(/z-index:-\d+/)
		expect(xml).toContain('<v:fill opacity="0.15"/>')
		expect(xml).toContain('mso-position-horizontal-relative:margin')
	})

	test('header perabot tetap ada, dan halaman pertama berbeda juga bertanda air', async () => {
		const { files } = await exported([paragraph('isi')], {
			setup: { ...DEFAULT_PAGE_SETUP, watermark: watermark({}) },
			furniture: {
				header: { default: { text: 'Kop Jurnal', align: 'right' }, first: { text: '', align: 'left' } },
			},
		})
		const headers = headersOf(files)
		expect(headers.length).toBeGreaterThanOrEqual(2)
		expect(headers.every((xml) => xml.includes('v:textpath'))).toBe(true)
		expect(headers.some((xml) => xml.includes('Kop Jurnal'))).toBe(true)
	})

	test('setiap section mendapat watermark-nya, termasuk section lanskap', async () => {
		const { files } = await exported(
			[
				paragraph('potret'),
				{ type: 'sectionBreak', attrs: { pageSetup: { orientation: 'landscape' }, columns: null } },
				paragraph('lanskap'),
			],
			{ setup: { ...DEFAULT_PAGE_SETUP, watermark: watermark({}) } },
		)
		const headers = headersOf(files)
		expect(headers).toHaveLength(2)
		expect(headers.every((xml) => xml.includes('string="RAHASIA"'))).toBe(true)
	})

	test('watermark gambar: gambar mengambang di belakang teks dengan opasitasnya', async () => {
		const { files } = await exported([paragraph('isi')], {
			setup: {
				...DEFAULT_PAGE_SETUP,
				watermark: watermark({
					kind: 'image',
					text: undefined,
					assetId: 'aset',
					imageDataUrl: PNG_1PX,
					opacity: 0.3,
				}),
			},
		})
		const xml = headersOf(files)[0] ?? ''
		expect(xml).toContain('behindDoc="1"')
		expect(xml).toContain('<a:alphaModFix amt="30000"/>')
		expect(Object.keys(files).some((name) => /^word\/_rels\/header\d+\.xml\.rels$/.test(name))).toBe(true)
	})

	test('watermark kosong tidak menulis apa pun', async () => {
		const { files } = await exported([paragraph('isi')], {
			setup: { ...DEFAULT_PAGE_SETUP, watermark: watermark({ text: '   ' }) },
		})
		expect(headersOf(files).some((xml) => xml.includes('v:shape'))).toBe(false)
	})
})

describe('KOL-17: tanpa paragraf kosong di batas section', () => {
	const sectionBreak = (attrs: object): JSONContent => ({
		type: 'sectionBreak',
		attrs: { pageSetup: null, columns: null, ...attrs },
	})

	test('sectPr menumpang di paragraf terakhir section (jurnal 1 → 2 → 1 kolom)', async () => {
		const { xml } = await exported([
			paragraph('abstrak'),
			sectionBreak({ columns: { count: 2 }, continuous: true }),
			paragraph('dua kolom'),
			sectionBreak({ columns: null, continuous: true }),
			paragraph('penutup'),
		])
		expect(xml).not.toMatch(/<w:p><w:pPr><w:sectPr>[\s\S]*?<\/w:sectPr><\/w:pPr><\/w:p>/)
		expect(paragraphWith(xml, 'abstrak')).toContain('<w:sectPr>')
		expect(paragraphWith(xml, 'dua kolom')).toContain('<w:sectPr>')
		expect(xml.match(/<w:sectPr/g) ?? []).toHaveLength(3)
	})

	test('section yang berakhir dengan tabel tetap memakai paragraf pemisah', () => {
		const source =
			'<w:body><w:tbl><w:tr/></w:tbl><w:p><w:pPr><w:sectPr><w:cols/></w:sectPr></w:pPr></w:p><w:p><w:r><w:t>b</w:t></w:r></w:p></w:body>'
		expect(attachSectionBreaks(source)).toBe(source)
	})

	test('paragraf berproperti: sectPr masuk ke ujung w:pPr-nya', () => {
		const source =
			'<w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:t>a</w:t></w:r></w:p><w:p><w:pPr><w:sectPr><w:cols/></w:sectPr></w:pPr></w:p>'
		expect(attachSectionBreaks(source)).toBe(
			'<w:p><w:pPr><w:jc w:val="center"/><w:sectPr><w:cols/></w:sectPr></w:pPr><w:r><w:t>a</w:t></w:r></w:p>',
		)
	})

	test('opasitas hanya ditempel ke gambar watermark', () => {
		const anchor = (name: string) =>
			`<wp:anchor><wp:docPr id="1" name="${name}"/><a:blip r:embed="rId1" cstate="none"/></wp:anchor>`
		const result = applyWatermarkAlpha(anchor('WritingHub Watermark') + anchor('Logo'), 15000)
		expect(result).toContain('<a:blip r:embed="rId1" cstate="none"><a:alphaModFix amt="15000"/></a:blip>')
		expect(result.match(/alphaModFix/g) ?? []).toHaveLength(1)
	})
})

describe('TBL-6/TBL-7: lebar tabel konsisten', () => {
	const cell = (value: string, attrs: Record<string, unknown> = {}, type = 'tableCell'): JSONContent => ({
		type,
		attrs,
		content: [paragraph(value)],
	})
	const sum = (values: number[]) => values.reduce((total, value) => total + value, 0)
	const tableXml = (xml: string) => /<w:tbl>[\s\S]*?<\/w:tbl>/.exec(xml)?.[0] ?? ''
	const gridOf = (xml: string) =>
		[...xml.matchAll(/<w:gridCol w:w="(\d+)"\/>/g)].map((match) => Number(match[1]))
	const tblWOf = (xml: string) => Number(/<w:tblW w:type="dxa" w:w="(\d+)"\/>/.exec(xml)?.[1])
	const rowWidths = (xml: string) =>
		[...xml.matchAll(/<w:tr>([\s\S]*?)<\/w:tr>/g)].map((row) =>
			sum([...row[1].matchAll(/<w:tcW w:type="dxa" w:w="(\d+)"\/>/g)].map((match) => Number(match[1]))),
		)

	test('satu kolom tanpa colwidth tidak menghapus lebar kolom lain; tblW = Σ gridCol = Σ tcW', async () => {
		const { xml } = await exported([
			{
				type: 'table',
				content: [
					{
						type: 'tableRow',
						content: [
							cell('A', { colwidth: [195] }),
							cell('B', { colwidth: [65] }),
							cell('C', { colwidth: [130] }),
							cell('D'),
						],
					},
				],
			},
		])
		const table = tableXml(xml)
		const grid = gridOf(table)
		expect(grid.slice(0, 3)).toEqual([195 * 15, 65 * 15, 130 * 15])
		expect(sum(grid)).toBe(Math.round(pageGeometry(DEFAULT_PAGE_SETUP).contentWidth * 15))
		expect(tblWOf(table)).toBe(sum(grid))
		expect(rowWidths(table)).toEqual([sum(grid)])
		expect(table).toContain('<w:tblLayout w:type="fixed"/>')
	})

	test('"Lebar tabel" 400 dipatuhi tanpa bertentangan dengan gridCol', async () => {
		const { xml } = await exported([
			{
				type: 'table',
				attrs: { tableWidth: 400 },
				content: [{ type: 'tableRow', content: [cell('x'), cell('y'), cell('z')] }],
			},
		])
		const table = tableXml(xml)
		expect(tblWOf(table)).toBe(6000)
		expect(sum(gridOf(table))).toBe(6000)
	})

	test('indentasi mengurangi lebar: tabel tidak melewati margin kanan', async () => {
		const { xml } = await exported([
			{
				type: 'table',
				attrs: { indentLeft: 60 },
				content: [
					{
						type: 'tableRow',
						content: [
							cell('a', { colwidth: [300] }),
							cell('b', { colwidth: [200] }),
							cell('c', { colwidth: [200] }),
						],
					},
				],
			},
		])
		const table = tableXml(xml)
		const indent = Number(/<w:tblInd w:type="dxa" w:w="(\d+)"\/>|<w:tblInd w:w="(\d+)"/.exec(table)?.[1] ?? 0)
		expect(indent).toBe(900)
		expect(tblWOf(table) + indent).toBeLessThanOrEqual(
			Math.round(pageGeometry(DEFAULT_PAGE_SETUP).contentWidth * 15),
		)
	})

	test('tabel di section dua kolom tidak lebih lebar dari kolomnya', async () => {
		const { xml } = await exported([
			paragraph('pembuka'),
			{ type: 'sectionBreak', attrs: { pageSetup: null, columns: { count: 2, gap: 24 }, continuous: true } },
			{ type: 'table', content: [{ type: 'tableRow', content: [cell('a'), cell('b')] }] },
		])
		const column = (pageGeometry(DEFAULT_PAGE_SETUP).contentWidth - 24) / 2
		expect(tblWOf(tableXml(xml))).toBeLessThanOrEqual(Math.round(column * 15))
	})
})

describe('TBL-11/TBL-12: bingkai dan judul sel', () => {
	const tableOf = (rows: JSONContent[][], attrs: Record<string, unknown> = {}): JSONContent => ({
		type: 'table',
		attrs,
		content: rows.map((cells) => ({ type: 'tableRow', content: cells })),
	})
	const cell = (value: string, attrs: Record<string, unknown> = {}, type = 'tableCell'): JSONContent => ({
		type,
		attrs,
		content: [paragraph(value)],
	})
	const cellXml = (xml: string, marker: string) => {
		const at = xml.indexOf(`>${marker}<`)
		return xml.slice(xml.lastIndexOf('<w:tc>', at), xml.indexOf('</w:tc>', at))
	}

	test('warna bingkai sel tanpa lebar menjadi w:tcBorders berwarna', async () => {
		const { xml } = await exported([tableOf([[cell('b1', { borderColor: '#e11d48' }), cell('biasa')]])])
		const red = cellXml(xml, 'b1')
		expect(red).toContain('<w:tcBorders>')
		expect(red).toMatch(/<w:top w:val="single" w:color="E11D48" w:sz="6"\/>/)
		expect(cellXml(xml, 'biasa')).not.toContain('<w:tcBorders>')
	})

	test('bingkai transparan menjadi garis "none"', async () => {
		const { xml } = await exported([tableOf([[cell('tanpa', { borderColor: 'transparent' })]])])
		expect(cellXml(xml, 'tanpa')).toMatch(/<w:top w:val="none"/)
	})

	test('sel judul tebal dan berlatar seperti kanvas; tabel polos tanpa latar', async () => {
		const { xml } = await exported([
			tableOf([
				[cell('Nama', {}, 'tableHeader'), cell('Nilai', {}, 'tableHeader')],
				[cell('isi'), cell('1')],
			]),
			tableOf([[cell('Polos', {}, 'tableHeader')]], { borderStyle: 'none' }),
		])
		const header = cellXml(xml, 'Nama')
		expect(header).toMatch(/<w:shd [^>]*w:fill="F5F6F6"/)
		expect(runWith(xml, 'Nama')).toContain('<w:b/>')
		expect(runWith(xml, 'isi')).not.toContain('<w:b/>')
		expect(cellXml(xml, 'Polos')).not.toContain('<w:shd ')
	})

	test('latar sel sendiri menang atas latar judul', async () => {
		const { xml } = await exported([
			tableOf([[cell('Kuning', { backgroundColor: '#fef08a' }, 'tableHeader')]]),
		])
		expect(cellXml(xml, 'Kuning')).toMatch(/w:fill="FEF08A"/)
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
