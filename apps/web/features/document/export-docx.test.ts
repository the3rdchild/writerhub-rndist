import { describe, expect, test } from 'bun:test'
import type { JSONContent } from '@tiptap/core'
import { ACADEMIC_NUMBERING, type DocumentTypography } from '@writer-hub/shared'
import { strFromU8, unzipSync } from 'fflate'
import { PAGE_BREAK_NODE } from '@/features/editor/page-break'
import { DEFAULT_PAGE_SETUP, type PageSetup, pageGeometry } from '@/features/editor/page-geometry'
import { DEFAULT_TYPOGRAPHY } from '@/features/editor/typography'
import { buildSchema } from '@/features/sync/serialize'
import { exportDocx, mergeTabContents } from './export-docx'

function tab(text: string): JSONContent {
	return {
		type: 'doc',
		content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
	}
}

describe('perakitan ekspor multi-tab', () => {
	test('tab digabung berurutan dengan page break di antaranya', () => {
		const merged = mergeTabContents([tab('satu'), tab('dua'), tab('tiga')])

		expect(merged.content?.map((node) => node.type)).toEqual([
			'paragraph',
			PAGE_BREAK_NODE,
			'paragraph',
			PAGE_BREAK_NODE,
			'paragraph',
		])
		const texts = merged.content
			?.filter((node) => node.type === 'paragraph')
			.map((node) => node.content?.[0].text)
		expect(texts).toEqual(['satu', 'dua', 'tiga'])
	})

	test('satu tab diekspor apa adanya, tanpa page break', () => {
		const merged = mergeTabContents([tab('sendirian')])

		expect(merged.content).toEqual(tab('sendirian').content)
	})

	test('daftar kosong menghasilkan dokumen kosong yang sah', () => {
		expect(mergeTabContents([])).toEqual({ type: 'doc', content: [{ type: 'paragraph' }] })
	})

	test('tab kosong tetap menyumbang page break-nya', () => {
		const merged = mergeTabContents([tab('isi'), { type: 'doc' }, tab('isi lagi')])

		expect(merged.content?.map((node) => node.type)).toEqual([
			'paragraph',
			PAGE_BREAK_NODE,
			PAGE_BREAK_NODE,
			'paragraph',
		])
	})

	test('hasil gabungan diterima skema editor, termasuk page break-nya', () => {
		const node = buildSchema().nodeFromJSON(mergeTabContents([tab('satu'), tab('dua')]))

		expect(node.childCount).toBe(3)
		expect(node.child(1).type.name).toBe(PAGE_BREAK_NODE)
	})
})

describe('blok daftar isi (A5)', () => {
	test('tocBlock diterima skema dengan atribut dan snapshotnya utuh', () => {
		const toc: JSONContent = {
			type: 'tocBlock',
			attrs: { listKind: 'isi', minLevel: 1, maxLevel: 3, snapshot: 'BAB 1\t1\nBAB 2\t5' },
		}
		const node = buildSchema().nodeFromJSON(mergeTabContents([{ type: 'doc', content: [toc] }]))

		expect(node.firstChild?.type.name).toBe('tocBlock')
		expect(node.firstChild?.attrs.snapshot).toBe('BAB 1\t1\nBAB 2\t5')
		expect(node.firstChild?.attrs.listKind).toBe('isi')
	})
})

describe('section DOCX (§P8&P9)', () => {
	async function documentXml(content: JSONContent[], setup?: PageSetup): Promise<string> {
		const doc = buildSchema().nodeFromJSON({ type: 'doc', content })
		const blob = await exportDocx(doc, {
			title: 'uji',
			geometry: pageGeometry(setup ?? DEFAULT_PAGE_SETUP),
			setup,
		})
		const files = unzipSync(new Uint8Array(await blob.arrayBuffer()))
		return strFromU8(files['word/document.xml'])
	}

	const paragraph = (text: string): JSONContent => ({
		type: 'paragraph',
		content: [{ type: 'text', text }],
	})

	const sectionBreak = (attrs: object): JSONContent => ({
		type: 'sectionBreak',
		attrs: { pageSetup: null, columns: null, ...attrs },
	})

	test('tanpa setup dasar seluruh naskah tetap satu section', () => {
		return documentXml([paragraph('satu')]).then((xml) => {
			expect(xml.match(/<w:sectPr/g) ?? []).toHaveLength(1)
		})
	})

	test('pembatas menerus ditulis sebagai continuous (E5)', async () => {
		const xml = await documentXml(
			[
				paragraph('satu kolom'),
				sectionBreak({ columns: { count: 2 }, continuous: true }),
				paragraph('dua kolom'),
				sectionBreak({ columns: null, continuous: true }),
				paragraph('satu lagi'),
			],
			DEFAULT_PAGE_SETUP,
		)

		expect(xml.match(/<w:type w:val="continuous"\/>/g) ?? []).toHaveLength(2)
	})

	test('pembatas "menerus" yang mengubah geometri ditulis TANPA continuous (E5)', async () => {
		const xml = await documentXml(
			[
				paragraph('potret'),
				sectionBreak({ pageSetup: { orientation: 'landscape' }, continuous: true }),
				paragraph('lanskap'),
			],
			DEFAULT_PAGE_SETUP,
		)

		expect(xml.match(/<w:type w:val="continuous"\/>/g) ?? []).toHaveLength(0)
	})

	test('tiap pembatas section menghasilkan sectPr tersendiri', async () => {
		const xml = await documentXml(
			[
				paragraph('potret'),
				sectionBreak({ pageSetup: { orientation: 'landscape' } }),
				paragraph('lanskap'),
				sectionBreak({ pageSetup: { ...DEFAULT_PAGE_SETUP } }),
				paragraph('potret lagi'),
			],
			DEFAULT_PAGE_SETUP,
		)

		expect(xml.match(/<w:sectPr/g) ?? []).toHaveLength(3)
		expect(xml).toContain('w:orient="landscape"')
	})

	test('orientasi lanskap menukar ukuran DAN menulis w:orient', async () => {
		const xml = await documentXml(
			[paragraph('a'), sectionBreak({ pageSetup: { orientation: 'landscape' } }), paragraph('b')],
			DEFAULT_PAGE_SETUP,
		)

		const portrait = pageGeometry(DEFAULT_PAGE_SETUP)
		const landscape = pageGeometry({ ...DEFAULT_PAGE_SETUP, orientation: 'landscape' })
		expect(xml).toContain(`w:w="${Math.round(landscape.width * 15)}"`)
		expect(xml).toContain(`w:h="${Math.round(landscape.height * 15)}"`)
		expect(Math.round(landscape.width)).toBe(Math.round(portrait.height))
	})

	test('kolom section jadi w:cols, dengan jaraknya', async () => {
		const xml = await documentXml(
			[paragraph('satu kolom'), sectionBreak({ columns: { count: 2, gap: 24 } }), paragraph('dua kolom')],
			DEFAULT_PAGE_SETUP,
		)

		expect(xml).toContain('w:num="2"')
		expect(xml).toContain(`w:space="${24 * 15}"`)
	})

	test('blok kolom gaya lama diratakan, bukan dipecah jadi section', async () => {
		const xml = await documentXml(
			[
				{
					type: 'columns',
					attrs: { count: 2 },
					content: [paragraph('isi di dalam blok kolom')],
				},
			],
			DEFAULT_PAGE_SETUP,
		)

		expect(xml.match(/<w:sectPr/g) ?? []).toHaveLength(1)
		expect(xml).not.toContain('w:num="2"')
		expect(xml).toContain('isi di dalam blok kolom')
	})

	/*
	 * Pewarisan perabot antar-section: Word mewarisi milik section sebelumnya,
	 * jadi pergantian visibilitas nomor wajib menulis perabotnya sendiri.
	 * Tanpa ini ada dua celah sekaligus: nomor yang dinyalakan lagi setelah
	 * section pembuka yang menyembunyikannya tidak pernah balik, dan dokumen
	 * tanpa perabot kehilangan nomor di section yang menyembunyikannya.
	 */
	async function footerPartsOf(
		content: JSONContent[],
		furniture?: Parameters<typeof exportDocx>[1]['furniture'],
	): Promise<string[]> {
		const blob = await exportDocx(buildSchema().nodeFromJSON({ type: 'doc', content }), {
			title: 'uji',
			geometry: pageGeometry(DEFAULT_PAGE_SETUP),
			setup: DEFAULT_PAGE_SETUP,
			...(furniture !== undefined ? { furniture } : {}),
		})
		const files = unzipSync(new Uint8Array(await blob.arrayBuffer()))
		return Object.keys(files)
			.filter((name) => /^word\/footer\d+\.xml$/.test(name))
			.sort()
			.map((name) => strFromU8(files[name]))
	}

	test('sampul tanpa nomor tidak menelan nomor isi yang menyala lagi', async () => {
		const footers = await footerPartsOf([
			paragraph('sampul'),
			sectionBreak({ pageSetup: { pageNumbering: { format: 'decimal', restart: 'continue', show: false } } }),
			paragraph('isi'),
		])

		expect(footers).toHaveLength(2)
		expect(footers.filter((xml) => /PAGE/.test(xml))).toHaveLength(1)
		expect(footers.filter((xml) => !/PAGE/.test(xml))).toHaveLength(1)
	})

	test('dokumen berperabot: sampul tanpa nomor, isi bernomor kembali', async () => {
		const footers = await footerPartsOf(
			[
				paragraph('sampul'),
				sectionBreak({
					pageSetup: { pageNumbering: { format: 'decimal', restart: 'continue', show: false } },
				}),
				paragraph('isi'),
			],
			{ footer: { default: { text: '{page}', align: 'center' } } },
		)

		expect(footers).toHaveLength(2)
		expect(footers.filter((xml) => /PAGE/.test(xml))).toHaveLength(1)
		expect(footers.filter((xml) => !/PAGE/.test(xml))).toHaveLength(1)
	})
})

describe('lebar kolom tabel di DOCX', () => {
	const cell = (text: string, type = 'tableCell', attrs: object = {}): JSONContent => ({
		type,
		attrs,
		content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
	})

	async function gridOf(header: JSONContent[]): Promise<number[]> {
		const doc = buildSchema().nodeFromJSON({
			type: 'doc',
			content: [
				{
					type: 'table',
					content: [
						{ type: 'tableRow', content: header },
						{ type: 'tableRow', content: [cell('a'), cell('b')] },
					],
				},
			],
		})
		const blob = await exportDocx(doc, {
			title: 'uji',
			geometry: pageGeometry(DEFAULT_PAGE_SETUP),
			setup: DEFAULT_PAGE_SETUP,
		})
		const xml = strFromU8(unzipSync(new Uint8Array(await blob.arrayBuffer()))['word/document.xml'])
		return [...xml.matchAll(/<w:gridCol w:w="(\d+)"\/>/g)].map((match) => Number(match[1]))
	}

	test('tabel tanpa colwidth dibagi rata atas lebar area teks', async () => {
		const grid = await gridOf([cell('Nama', 'tableHeader'), cell('NPM', 'tableHeader')])
		const expected = Math.round((pageGeometry(DEFAULT_PAGE_SETUP).contentWidth / 2) * 15)

		expect(grid).toEqual([expected, expected])
		expect(grid[0]).toBeGreaterThan(1000)
	})

	test('colwidth yang sudah diatur dipakai apa adanya', async () => {
		const grid = await gridOf([
			cell('Nama', 'tableHeader', { colwidth: [420] }),
			cell('NPM', 'tableHeader', { colwidth: [180] }),
		])

		expect(grid).toEqual([420 * 15, 180 * 15])
	})
})

describe('penggabungan sel di DOCX', () => {
	const cell = (text: string, attrs: object = {}): JSONContent => ({
		type: 'tableCell',
		attrs,
		content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
	})

	async function xmlOf(rows: JSONContent[]): Promise<string> {
		const doc = buildSchema().nodeFromJSON({
			type: 'doc',
			content: [{ type: 'table', content: rows }],
		})
		const blob = await exportDocx(doc, {
			title: 'uji',
			geometry: pageGeometry(DEFAULT_PAGE_SETUP),
			setup: DEFAULT_PAGE_SETUP,
		})
		return strFromU8(unzipSync(new Uint8Array(await blob.arrayBuffer()))['word/document.xml'])
	}

	test('colspan sel jadi gridSpan di XML', async () => {
		const xml = await xmlOf([{ type: 'tableRow', content: [cell('gabung', { colspan: 2 })] }])
		expect(xml).toContain('<w:gridSpan w:val="2"/>')
	})

	test('rowspan sel jadi vMerge restart beserta sel lanjutannya', async () => {
		const xml = await xmlOf([
			{ type: 'tableRow', content: [cell('atas', { rowspan: 2 }), cell('B1')] },
			{ type: 'tableRow', content: [cell('B2')] },
		])

		expect(xml).toContain('<w:vMerge w:val="restart"/>')
		expect(xml).toContain('<w:vMerge w:val="continue"/>')
	})

	test('sel tanpa rowspan tidak membawa vMerge', async () => {
		const xml = await xmlOf([{ type: 'tableRow', content: [cell('biasa')] }])
		expect(xml).not.toContain('vMerge')
	})
})

describe('isi sel selain paragraf di DOCX (EX-1)', () => {
	const PNG_1PX =
		'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
	const EMU_PER_PX = 9525

	const text = (value: string): JSONContent => ({
		type: 'paragraph',
		content: [{ type: 'text', text: value }],
	})
	const cell = (...content: JSONContent[]): JSONContent => ({ type: 'tableCell', content })
	const table = (...rows: JSONContent[][]): JSONContent => ({
		type: 'table',
		content: rows.map((cells) => ({ type: 'tableRow', content: cells })),
	})
	const list = (type: 'bulletList' | 'orderedList', ...items: string[]): JSONContent => ({
		type,
		content: items.map((item) => ({ type: 'listItem', content: [text(item)] })),
	})

	/** Lebar isi satu sel dari tabel dua kolom tanpa colwidth, dalam px. */
	const halfCellWidth = pageGeometry(DEFAULT_PAGE_SETUP).contentWidth / 2 - (2 * 108) / 15

	async function xmlOf(content: JSONContent[]): Promise<string> {
		const doc = buildSchema().nodeFromJSON({ type: 'doc', content })
		const blob = await exportDocx(doc, {
			title: 'uji',
			geometry: pageGeometry(DEFAULT_PAGE_SETUP),
			setup: DEFAULT_PAGE_SETUP,
		})
		return strFromU8(unzipSync(new Uint8Array(await blob.arrayBuffer()))['word/document.xml'])
	}

	/** Penanda itu berada di dalam sel tabel: `<w:tc>` terakhir sebelumnya belum ditutup. */
	const insideCell = (xml: string, marker: string) => {
		const at = xml.indexOf(marker)
		return at >= 0 && xml.lastIndexOf('<w:tc>', at) > xml.lastIndexOf('</w:tc>', at)
	}

	/** XML paragraf Word yang memuat penanda itu. */
	const paragraphWith = (xml: string, marker: string) => {
		const at = xml.indexOf(marker)
		return xml.slice(xml.lastIndexOf('<w:p>', at), xml.indexOf('</w:p>', at))
	}

	test('daftar berpoin dan bernomor di dalam sel ikut sebagai butir Word', async () => {
		const xml = await xmlOf([
			table([
				cell(text('Temuan'), list('bulletList', 'butir berpoin')),
				cell(list('orderedList', 'butir bernomor')),
			]),
		])

		for (const marker of ['butir berpoin', 'butir bernomor']) {
			expect(insideCell(xml, marker)).toBe(true)
			expect(paragraphWith(xml, marker)).toContain('<w:numPr>')
		}
		expect(insideCell(xml, 'Temuan')).toBe(true)
	})

	test('gambar di dalam sel ikut, dan diperkecil selebar selnya', async () => {
		const xml = await xmlOf([
			table([
				cell(text('Grafik')),
				cell(text('penanda-gambar'), {
					type: 'htmlBlock',
					attrs: {
						html: '<div>grafik batang</div>',
						height: 400,
						snapshot: PNG_1PX,
						snapshotWidth: 1600,
						snapshotHeight: 800,
					},
				}),
			]),
		])

		expect(insideCell(xml, '<w:drawing>')).toBe(true)
		const width = Number(/<wp:extent cx="(\d+)"/.exec(xml)?.[1])
		expect(width).toBeGreaterThan(0)
		expect(width).toBeLessThanOrEqual(Math.round(halfCellWidth) * EMU_PER_PX)
	})

	test('tabel bersarang ikut, selebar selnya, dan sel luarnya tetap ditutup paragraf', async () => {
		const xml = await xmlOf([
			table([cell(text('kiri')), cell(table([cell(text('dalam-a')), cell(text('dalam-b'))]))]),
		])

		expect(xml.match(/<w:tbl>/g)?.length).toBe(2)
		expect(insideCell(xml, 'dalam-b')).toBe(true)
		// Word menolak sel yang berakhir dengan tabel tanpa paragraf sesudahnya.
		expect(xml).not.toContain('</w:tbl></w:tc>')

		const grids = [...xml.matchAll(/<w:tblGrid>([\s\S]*?)<\/w:tblGrid>/g)].map((grid) =>
			[...grid[1].matchAll(/w:w="(\d+)"/g)].reduce((sum, match) => sum + Number(match[1]), 0),
		)
		const inner = Math.min(...grids)
		// Tiap kolom dibulatkan ke twip sendiri-sendiri: selisih 1 per kolom.
		expect(inner).toBeLessThanOrEqual(Math.round(halfCellWidth * 15) + 2)
	})

	test('blok kode di dalam sel memakai huruf mesin ketik, satu paragraf per baris', async () => {
		const xml = await xmlOf([
			table([
				cell({
					type: 'codeBlock',
					attrs: { language: 'python' },
					content: [{ type: 'text', text: 'baris_satu = 1\nbaris_dua = 2' }],
				}),
			]),
		])

		expect(paragraphWith(xml, 'baris_satu')).toContain('Consolas')
		expect(paragraphWith(xml, 'baris_satu')).not.toContain('baris_dua')
		expect(insideCell(xml, 'baris_dua')).toBe(true)
	})

	test('sel berisi paragraf saja tetap seperti sebelumnya', async () => {
		const xml = await xmlOf([table([cell(text('polos'))])])

		expect(insideCell(xml, 'polos')).toBe(true)
		expect(paragraphWith(xml, 'polos')).not.toContain('<w:numPr>')
		expect(xml).not.toContain('<w:drawing>')
	})
})

describe('gambar naskah di DOCX (EX-7)', () => {
	/** PNG 1x1 yang sah; ukuran di halaman datang dari atribut node. */
	const PNG_1PX =
		'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
	const EMU_PER_PX = 9525
	const contentWidth = pageGeometry(DEFAULT_PAGE_SETUP).contentWidth

	const image = (attrs: Record<string, unknown>): JSONContent => ({
		type: 'image',
		attrs: { src: PNG_1PX, ...attrs },
	})

	async function docxOf(content: JSONContent[]) {
		const doc = buildSchema().nodeFromJSON({ type: 'doc', content })
		const blob = await exportDocx(doc, {
			title: 'uji',
			geometry: pageGeometry(DEFAULT_PAGE_SETUP),
			setup: DEFAULT_PAGE_SETUP,
		})
		const files = unzipSync(new Uint8Array(await blob.arrayBuffer()))
		return { files, xml: strFromU8(files['word/document.xml']) }
	}

	/** Ukuran gambar pertama di berkas, dalam px. */
	const extentOf = (xml: string) => {
		const match = /<wp:extent cx="(\d+)" cy="(\d+)"/.exec(xml)
		return match ? { width: Number(match[1]) / EMU_PER_PX, height: Number(match[2]) / EMU_PER_PX } : null
	}

	/** XML paragraf Word yang memuat penanda itu. */
	const paragraphWith = (xml: string, marker: string) => {
		const at = xml.indexOf(marker)
		return xml.slice(xml.lastIndexOf('<w:p>', at), xml.indexOf('</w:p>', at))
	}

	test('gambar di badan naskah ikut, dengan ukuran dari layar', async () => {
		const { files, xml } = await docxOf([image({ width: 300, height: 150 })])

		expect(xml).toContain('<w:drawing>')
		expect(Object.keys(files).some((name) => name.startsWith('word/media/'))).toBe(true)
		expect(extentOf(xml)).toEqual({ width: 300, height: 150 })
	})

	test('lebar persen bentuk lama dihitung dari area teks, dengan rasio hakiki', async () => {
		const { xml } = await docxOf([image({ width: 50 })])
		const half = Math.round(contentWidth / 2)

		expect(extentOf(xml)).toEqual({ width: half, height: half })
	})

	test('perataan dan teks alt ikut', async () => {
		const { xml } = await docxOf([
			image({ width: 200, height: 100, align: 'center', alt: 'Grafik penjualan' }),
		])

		expect(paragraphWith(xml, '<w:drawing>')).toContain('<w:jc w:val="center"/>')
		expect(xml).toContain('descr="Grafik penjualan"')
	})

	test('gambar di dalam sel ikut, dan tidak lebih lebar dari selnya', async () => {
		const cell = (content: JSONContent): JSONContent => ({ type: 'tableCell', content: [content] })
		const { xml } = await docxOf([
			{
				type: 'table',
				content: [
					{
						type: 'tableRow',
						content: [
							cell({ type: 'paragraph', content: [{ type: 'text', text: 'Grafik' }] }),
							cell(image({ width: 2000, height: 1000 })),
						],
					},
				],
			},
		])
		const at = xml.indexOf('<w:drawing>')

		expect(at).toBeGreaterThan(0)
		expect(xml.lastIndexOf('<w:tc>', at)).toBeGreaterThan(xml.lastIndexOf('</w:tc>', at))
		const size = extentOf(xml)
		expect(size?.width).toBeLessThan(contentWidth / 2)
		expect((size?.width ?? 0) / (size?.height ?? 1)).toBeCloseTo(2, 1)
	})

	test('gambar yang gagal diambil meninggalkan penanda, ekspornya tetap jadi', async () => {
		const { xml } = await docxOf([
			{ type: 'paragraph', content: [{ type: 'text', text: 'sebelum' }] },
			image({ src: 'data:image/png;base64,', alt: 'Peta lokasi' }),
			{ type: 'paragraph', content: [{ type: 'text', text: 'sesudah' }] },
		])

		expect(xml).not.toContain('<w:drawing>')
		expect(xml).toContain('[Image not exported: Peta lokasi]')
		expect(xml).toContain('sesudah')
	})
})

describe('baris baru di dalam satu simpul teks', () => {
	test('jadi <w:br/>, bukan spasi', async () => {
		const doc = buildSchema().nodeFromJSON({
			type: 'doc',
			content: [{ type: 'paragraph', content: [{ type: 'text', text: 'PROPOSAL PROYEK\nTUGAS AKHIR' }] }],
		})
		const blob = await exportDocx(doc, {
			title: 'uji',
			geometry: pageGeometry(DEFAULT_PAGE_SETUP),
			setup: DEFAULT_PAGE_SETUP,
		})
		const xml = strFromU8(unzipSync(new Uint8Array(await blob.arrayBuffer()))['word/document.xml'])

		expect(xml).toContain('<w:br/>')
		expect(xml).toContain('PROPOSAL PROYEK')
		expect(xml).toContain('TUGAS AKHIR')
		expect(xml).not.toContain('PROPOSAL PROYEK\nTUGAS AKHIR')
	})
})

describe('tipografi di berkas DOCX', () => {
	const skripsi: DocumentTypography = {
		baseFont: { family: '"Times New Roman", Times, serif', sizePt: 12 },
		lineHeight: 1.5,
		paragraph: { align: 'justify', firstLinePt: 28 },
		headings: { 1: { sizePt: 12, align: 'center', spaceBeforePt: 12, spaceAfterPt: 6 } },
	}

	async function stylesXml(typography?: DocumentTypography): Promise<string> {
		const doc = buildSchema().nodeFromJSON({
			type: 'doc',
			content: [{ type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'BAB I' }] }],
		})
		const blob = await exportDocx(doc, {
			title: 'uji',
			geometry: pageGeometry(DEFAULT_PAGE_SETUP),
			typography,
		})
		const files = unzipSync(new Uint8Array(await blob.arrayBuffer()))
		return strFromU8(files['word/styles.xml'])
	}

	test('badan naskah memakai huruf dan ukuran dokumen', async () => {
		const xml = await stylesXml(skripsi)
		expect(xml).toContain('Times New Roman')
		// Word menyimpan ukuran dalam setengah titik: 12pt = 24.
		expect(xml).toMatch(/<w:docDefaults>[\s\S]*?<w:sz w:val="24"/)
	})

	// Inti perbaikannya di sisi berkas: tanpa gaya judul sendiri, Word memakai
	// Heading 1 bawaannya - biru dan membesar - jadi hasil ekspor tidak lagi
	// serupa dengan yang tampil di kanvas.
	test('judul BAB tetap 12pt, tebal, hitam, rata tengah', async () => {
		const xml = await stylesXml(skripsi)
		const heading = xml.match(/<w:style [^>]*w:styleId="Heading1"[\s\S]*?<\/w:style>/)?.[0]
		expect(heading).toBeDefined()
		expect(heading).toContain('<w:sz w:val="24"')
		expect(heading).toContain('<w:b')
		expect(heading).toContain('000000')
		expect(heading).toContain('<w:jc w:val="center"')
	})

	test('spasi 1,5 tersimpan sebagai spasi 1,5 milik Word', async () => {
		const xml = await stylesXml(skripsi)
		// 1,5 x 240 = 360, angka yang sama dengan yang ditulis Google Docs.
		expect(xml).toMatch(/<w:spacing[^>]*w:line="360"/)
	})

	test('tanpa tipografi, berkas tidak membawa gaya buatan sendiri', async () => {
		const xml = await stylesXml()
		expect(xml).not.toContain('Times New Roman')
	})
})

describe('blok HTML di berkas DOCX', () => {
	/** PNG 1x1 yang sah - cukup untuk menguji jalurnya, bukan rupanya. */
	const PNG_1PX =
		'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

	const paragraph = (text: string): JSONContent => ({
		type: 'paragraph',
		content: [{ type: 'text', text }],
	})

	async function docxFiles(attrs: Record<string, unknown>) {
		const doc = buildSchema().nodeFromJSON({
			type: 'doc',
			content: [{ type: 'htmlBlock', attrs }],
		})
		const blob = await exportDocx(doc, {
			title: 'uji',
			geometry: pageGeometry(DEFAULT_PAGE_SETUP),
		})
		return unzipSync(new Uint8Array(await blob.arrayBuffer()))
	}

	test('potretan blok ikut sebagai gambar', async () => {
		const files = await docxFiles({
			html: '<h1>Diskon</h1>',
			height: 320,
			snapshot: PNG_1PX,
			snapshotWidth: 400,
			snapshotHeight: 300,
		})

		expect(strFromU8(files['word/document.xml'])).toContain('<w:drawing>')
		expect(Object.keys(files).some((name) => name.startsWith('word/media/'))).toBe(true)
	})

	// Blok yang gagal dipotret tidak boleh menggagalkan seluruh ekspor.
	test('blok tanpa potretan dilewati, ekspornya tetap jadi', async () => {
		const files = await docxFiles({ html: '<h1>Diskon</h1>', height: 320, snapshot: '' })

		expect(strFromU8(files['word/document.xml'])).not.toContain('<w:drawing>')
		expect(files['word/document.xml']).toBeDefined()
	})

	// HTML mentahnya tidak pernah bocor ke berkas: yang diekspor gambarnya.
	// Full-bleed di kanvas harus full-bleed juga di berkas. Gambar yang
	// berjangkar ke kolom teks akan diperkecil masuk margin, dan hasil ekspornya
	// tidak lagi serupa dengan yang dilihat penulis.
	test('mode halaman berjangkar ke kertas, bukan ke kolom teks', async () => {
		const files = await docxFiles({
			html: '<h1>Flyer</h1>',
			fit: 'page',
			snapshot: PNG_1PX,
			snapshotWidth: 794,
			snapshotHeight: 1123,
		})
		const xml = strFromU8(files['word/document.xml'])

		expect(xml).toContain('<wp:anchor')
		expect(xml).toContain('relativeFrom="page"')
		// Sudut lembar, bukan sudut kotak konten.
		expect(xml).toContain('<wp:posOffset>0</wp:posOffset>')
		// 794px x 9525 EMU/px - ukuran lembar penuh, bukan lebar kolom teks.
		expect(xml).toContain('cx="7562850"')
	})

	// Word tidak tahu blok ini memiliki satu lembar penuh; tanpa pemenggal,
	// naskah lain mendarat di halaman yang sama lalu tertimpa gambarnya.
	test('mode halaman memulai halaman baru', async () => {
		const files = await docxFiles({
			html: '<h1>Flyer</h1>',
			fit: 'page',
			snapshot: PNG_1PX,
			snapshotWidth: 794,
			snapshotHeight: 1123,
		})
		expect(strFromU8(files['word/document.xml'])).toContain('<w:pageBreakBefore/>')
	})

	/*
	 * Paragraf kosong sesudah blok `fit: 'page'` tidak boleh ikut ke DOCX
	 * (EX-2). Blok itu sudah memulai halaman baru lewat `pageBreakBefore`;
	 * paragraf kosong sesudahnya hanya menambah halaman kosong di Word.
	 * Paragraf berisi teks tetap diekspor.
	 */
	test('paragraf kosong setelah blok mode halaman dilewati (EX-2)', async () => {
		const doc = buildSchema().nodeFromJSON({
			type: 'doc',
			content: [
				{
					type: 'htmlBlock',
					attrs: {
						html: '<h1>Flyer</h1>',
						fit: 'page',
						height: 600,
						snapshot: PNG_1PX,
						snapshotWidth: 794,
						snapshotHeight: 1123,
					},
				},
				{ type: 'paragraph' },
			],
		})
		const blob = await exportDocx(doc, {
			title: 'uji',
			geometry: pageGeometry(DEFAULT_PAGE_SETUP),
		})
		const xml = strFromU8(unzipSync(new Uint8Array(await blob.arrayBuffer()))['word/document.xml'])

		// Gambar blok ada, tetapi tidak ada paragraf kosong sesudahnya.
		expect(xml).toContain('<w:drawing>')
		// Hanya satu paragraf di seluruh dokumen: paragraf yang membawa gambar.
		expect(xml.match(/<w:p[ >]/g) ?? []).toHaveLength(1)
	})

	test('paragraf berisi teks setelah blok mode halaman tetap diekspor (EX-2)', async () => {
		const doc = buildSchema().nodeFromJSON({
			type: 'doc',
			content: [
				{
					type: 'htmlBlock',
					attrs: {
						html: '<h1>Flyer</h1>',
						fit: 'page',
						height: 600,
						snapshot: PNG_1PX,
						snapshotWidth: 794,
						snapshotHeight: 1123,
					},
				},
				paragraph('Teks setelah flyer'),
			],
		})
		const blob = await exportDocx(doc, {
			title: 'uji',
			geometry: pageGeometry(DEFAULT_PAGE_SETUP),
		})
		const xml = strFromU8(unzipSync(new Uint8Array(await blob.arrayBuffer()))['word/document.xml'])

		expect(xml).toContain('Teks setelah flyer')
	})

	// Sisipan tetap seperti semula: mengalir di dalam kolom teks, diperkecil
	// kalau lebih lebar, dan tidak memaksa halaman baru.
	test('sisipan tidak berjangkar dan tidak memenggal halaman', async () => {
		const files = await docxFiles({
			html: '<p>kecil</p>',
			fit: 'embed',
			height: 200,
			snapshot: PNG_1PX,
			snapshotWidth: 400,
			snapshotHeight: 200,
		})
		const xml = strFromU8(files['word/document.xml'])

		expect(xml).toContain('<w:drawing>')
		expect(xml).not.toContain('<wp:anchor')
		expect(xml).not.toContain('<w:pageBreakBefore/>')
	})

	test('sumber HTML tidak ikut ke dalam berkas', async () => {
		const files = await docxFiles({
			html: '<h1>RAHASIA</h1>',
			height: 320,
			snapshot: PNG_1PX,
			snapshotWidth: 400,
			snapshotHeight: 300,
		})

		expect(strFromU8(files['word/document.xml'])).not.toContain('RAHASIA')
	})
})

describe('hentian halaman di berkas DOCX', () => {
	const berbab: DocumentTypography = {
		baseFont: { family: '"Times New Roman", Times, serif', sizePt: 12 },
		lineHeight: 1.5,
		headings: { 1: { sizePt: 12, pageBreakBefore: true } },
	}

	async function documentXmlOf(content: JSONContent[], typography?: DocumentTypography) {
		const doc = buildSchema().nodeFromJSON({ type: 'doc', content })
		const blob = await exportDocx(doc, {
			title: 'uji',
			geometry: pageGeometry(DEFAULT_PAGE_SETUP),
			typography,
		})
		const files = unzipSync(new Uint8Array(await blob.arrayBuffer()))
		return { document: strFromU8(files['word/document.xml']), styles: strFromU8(files['word/styles.xml']) }
	}

	const heading = (text: string): JSONContent => ({
		type: 'heading',
		attrs: { level: 1 },
		content: [{ type: 'text', text }],
	})

	// Tanpa ini BAB tetap menyambung di berkasnya meski kanvasnya sudah benar.
	test('gaya Heading 1 membawa hentian halaman', async () => {
		const { styles } = await documentXmlOf([heading('BAB I')], berbab)
		const style = styles.match(/<w:style [^>]*w:styleId="Heading1"[\s\S]*?<\/w:style>/)?.[0]

		expect(style).toContain('<w:pageBreakBefore/>')
	})

	test('template tanpa aturan itu tidak memaksa hentian', async () => {
		const { styles } = await documentXmlOf([heading('Bagian')], {
			baseFont: { family: 'Arial', sizePt: 11 },
			lineHeight: 1.15,
		})
		const style = styles.match(/<w:style [^>]*w:styleId="Heading1"[\s\S]*?<\/w:style>/)?.[0]

		expect(style).not.toContain('<w:pageBreakBefore/>')
	})

	/*
	 * Butir menu "Tambah hentian halaman sebelum" dulu berhenti sebagai CSS:
	 * ia bekerja saat mencetak, tapi hilang sama sekali dari berkas ekspor.
	 */
	test('hentian manual satu blok ikut terekspor', async () => {
		const { document } = await documentXmlOf([
			{ type: 'paragraph', content: [{ type: 'text', text: 'sebelum' }] },
			{
				type: 'paragraph',
				attrs: { pageBreakBefore: true },
				content: [{ type: 'text', text: 'sesudah' }],
			},
		])

		expect(document).toContain('<w:pageBreakBefore/>')
	})

	test('saklar keep ikut terekspor', async () => {
		const { document } = await documentXmlOf([
			{
				type: 'paragraph',
				attrs: { keepWithNext: true, keepLines: true },
				content: [{ type: 'text', text: 'menyatu' }],
			},
		])

		expect(document).toContain('<w:keepNext/>')
		expect(document).toContain('<w:keepLines/>')
	})

	test('paragraf biasa tidak membawa properti itu', async () => {
		const { document } = await documentXmlOf([
			{ type: 'paragraph', content: [{ type: 'text', text: 'polos' }] },
		])

		expect(document).not.toContain('<w:pageBreakBefore/>')
		expect(document).not.toContain('<w:keepNext/>')
	})
})

describe('daftar isi di berkas DOCX', () => {
	async function tocXml(snapshot: string) {
		const doc = buildSchema().nodeFromJSON({
			type: 'doc',
			content: [{ type: 'tocBlock', attrs: { snapshot, listKind: 'isi' } }],
		})
		const blob = await exportDocx(doc, { title: 'uji', geometry: pageGeometry(DEFAULT_PAGE_SETUP) })
		const files = unzipSync(new Uint8Array(await blob.arrayBuffer()))
		return strFromU8(files['word/document.xml'])
	}

	/*
	 * Tanpa perhentian tab, Word merender tab pemisahnya apa adanya: nomor
	 * halaman menggantung di tengah baris tanpa titik penuntun - persis rupa
	 * kacau yang bikin daftar isi ini diperbaiki sejak awal.
	 */
	test('tiap baris punya perhentian tab rata kanan dengan titik penuntun', async () => {
		const xml = await tocXml('BAB I PENDAHULUAN\t1\nBAB II TINJAUAN PUSTAKA\t9')

		expect(xml).toContain('<w:tabs>')
		expect(xml).toContain('w:val="right"')
		expect(xml).toContain('w:leader="dot"')
	})

	test('satu baris satu paragraf', async () => {
		const xml = await tocXml('BAB I\t1\nBAB II\t9')

		expect(xml).toContain('BAB I')
		expect(xml).toContain('BAB II')
		expect(xml.match(/<w:tabs>/g) ?? []).toHaveLength(2)
	})

	test('daftar isi yang belum sempat dipotret tidak menghasilkan paragraf kosong', async () => {
		const xml = await tocXml('')

		expect(xml).not.toContain('<w:tabs>')
	})
})

/*
 * Ekspor model section yang lebih tebal (W3/W4, DOCX-IMPORT-GAP-V3).
 *
 * Selama bentuknya belum lengkap di kedua ujung, tiap dokumen berkolom yang
 * masuk lalu diekspor kembali kehilangan lebar kolomnya untuk kedua kalinya.
 */
describe('kolom tak-sama dan pindah kolom pulang ke DOCX (W3/W4)', () => {
	async function documentXml(content: JSONContent[], setup?: PageSetup): Promise<string> {
		const doc = buildSchema().nodeFromJSON({ type: 'doc', content })
		const blob = await exportDocx(doc, {
			title: 'uji',
			geometry: pageGeometry(setup ?? DEFAULT_PAGE_SETUP),
			setup: setup ?? DEFAULT_PAGE_SETUP,
		})
		const files = unzipSync(new Uint8Array(await blob.arrayBuffer()))
		return strFromU8(files['word/document.xml'])
	}

	const paragraph = (text: string): JSONContent => ({
		type: 'paragraph',
		content: [{ type: 'text', text }],
	})
	const sectionBreak = (attrs: object): JSONContent => ({
		type: 'sectionBreak',
		attrs: { pageSetup: null, columns: null, ...attrs },
	})

	test('W3: node columnBreak jadi w:br w:type="column", bukan paragraf kosong', async () => {
		const xml = await documentXml([paragraph('kiri'), { type: 'columnBreak' }, paragraph('kanan')])

		expect(xml).toContain('w:type="column"')
		expect(xml).toContain('kiri')
		expect(xml).toContain('kanan')
	})

	test('W4: lebar tak-sama jadi anak w:col dengan equalWidth="0"', async () => {
		const xml = await documentXml([
			paragraph('satu kolom'),
			sectionBreak({ columns: { count: 2, widths: [130, 448], gaps: [36] } }),
			paragraph('dua kolom'),
		])

		/* ST_OnOff: pustaka docx menulis "false", yang sah dan sama artinya
		 * dengan "0" - Word maupun LibreOffice membaca keduanya. */
		expect(xml).toContain('w:equalWidth="false"')
		expect(xml).toContain(`w:space="${36 * 15}"`)

		const cols = /<w:cols[^>]*>([\s\S]*?)<\/w:cols>/.exec(xml)
		expect(cols).not.toBeNull()
		const widths = [...(cols?.[1] ?? '').matchAll(/<w:col [^>]*w:w="(\d+)"/g)].map((match) =>
			Number(match[1]),
		)
		expect(widths).toHaveLength(2)
		/* Lebar adalah proporsi: yang ditulis mengisi lebar kolom teks section
		 * ini, dengan perbandingan yang sama seperti saat diimpor. */
		expect(widths[0] / widths[1]).toBeCloseTo(130 / 448, 2)
		const contentWidth = pageGeometry(DEFAULT_PAGE_SETUP).contentWidth * 15
		expect(widths[0] + widths[1] + 36 * 15).toBeCloseTo(contentWidth, -1)
	})

	test('W4: kolom sama lebar tetap ditulis equalWidth="1", tanpa anak w:col', async () => {
		const xml = await documentXml([
			paragraph('satu kolom'),
			sectionBreak({ columns: { count: 2, gap: 24 } }),
			paragraph('dua kolom'),
		])

		expect(xml).toContain('w:num="2"')
		expect(xml).toContain('w:equalWidth="true"')
		expect(xml).not.toContain('<w:col ')
	})

	test('putar-balik: impor → ekspor → impor mempertahankan perbandingan kolom', async () => {
		const { readDocx } = await import('./docx')

		const first = await documentXml([
			paragraph('satu kolom'),
			sectionBreak({ columns: { count: 2, widths: [130, 448], gaps: [36] } }),
			paragraph('dua kolom'),
		])
		expect(first).toContain('w:equalWidth="false"')

		const doc = buildSchema().nodeFromJSON({
			type: 'doc',
			content: [
				paragraph('satu kolom'),
				sectionBreak({ columns: { count: 2, widths: [130, 448], gaps: [36] } }),
				paragraph('dua kolom'),
			],
		})
		const blob = await exportDocx(doc, {
			title: 'uji',
			geometry: pageGeometry(DEFAULT_PAGE_SETUP),
			setup: DEFAULT_PAGE_SETUP,
		})
		const round = await readDocx(new Uint8Array(await blob.arrayBuffer()))
		const breakNode = (round.content.content ?? []).find((node) => node.type === 'sectionBreak')
		const columns = breakNode?.attrs?.columns as { count: number; widths?: number[] }

		expect(columns?.count).toBe(2)
		expect(columns?.widths).toHaveLength(2)
		expect((columns.widths as number[])[0] / (columns.widths as number[])[1]).toBeCloseTo(130 / 448, 1)
	})
})

/* Sampul dan halaman pengesahan baku memakai tabel polos; di Word ia harus
 * tetap tanpa garis, bukan mendapat kisi bawaan docx. */
describe('tabel polos di DOCX', () => {
	test('borderStyle none menjadi garis "none" di setiap sisi', async () => {
		const { FRONT_MATTER, frontMatterNodes } = await import('@writer-hub/shared')
		const content = frontMatterNodes('approval', FRONT_MATTER.skripsi) as JSONContent[]
		const doc = buildSchema().nodeFromJSON({ type: 'doc', content })
		const blob = await exportDocx(doc, { title: 'uji', geometry: pageGeometry(DEFAULT_PAGE_SETUP) })
		const xml = strFromU8(unzipSync(new Uint8Array(await blob.arrayBuffer()))['word/document.xml'])
		const borders = /<w:tblBorders>([\s\S]*?)<\/w:tblBorders>/.exec(xml)?.[1] ?? ''
		for (const side of ['top', 'bottom', 'left', 'right', 'insideH', 'insideV']) {
			expect(borders).toMatch(new RegExp(`<w:${side} w:val="none"`))
		}
		expect(xml).toContain('HALAMAN PENGESAHAN')
	})
})

describe('penomoran karya ilmiah di DOCX', () => {
	const text = (value: string): JSONContent => ({
		type: 'paragraph',
		content: [{ type: 'text', text: value }],
	})
	const h1 = (value: string): JSONContent => ({
		type: 'heading',
		attrs: { level: 1 },
		content: [{ type: 'text', text: value }],
	})

	/** Tiap section: format & start penomorannya, titlePg, dan isi part header/footer per jenis. */
	async function sectionsOf() {
		const setup: PageSetup = { ...DEFAULT_PAGE_SETUP, pageNumbering: ACADEMIC_NUMBERING.front }
		const blob = await exportDocx(
			buildSchema().nodeFromJSON({
				type: 'doc',
				content: [
					text('SKRIPSI'),
					{ type: PAGE_BREAK_NODE },
					h1('KATA PENGANTAR'),
					text('Puji syukur.'),
					{
						type: 'sectionBreak',
						attrs: {
							pageSetup: { pageNumbering: ACADEMIC_NUMBERING.body },
							columns: null,
							continuous: false,
						},
					},
					h1('BAB I PENDAHULUAN'),
					text('Isi bab satu.'),
					{ type: PAGE_BREAK_NODE },
					h1('BAB II TINJAUAN PUSTAKA'),
					text('Isi bab dua.'),
				],
			}),
			{
				title: 'uji',
				geometry: pageGeometry(setup),
				setup,
				furniture: { footer: { first: { text: '', align: 'center' } } },
				typography: {
					...DEFAULT_TYPOGRAPHY,
					headings: { ...DEFAULT_TYPOGRAPHY.headings, 1: { pageBreakBefore: true } },
				},
			},
		)
		const files = unzipSync(new Uint8Array(await blob.arrayBuffer()))
		const xml = strFromU8(files['word/document.xml'])
		const rels = strFromU8(files['word/_rels/document.xml.rels'])
		const target = (id: string) => new RegExp(`Id="${id}"[^>]*Target="([^"]+)"`).exec(rels)?.[1] ?? ''
		const part = (id: string) => strFromU8(files[`word/${target(id)}`])
		/** "PAGE@right" - letak field PAGE di part itu, atau "-" bila tanpa nomor. */
		const numberIn = (partXml: string) =>
			/PAGE/.test(partXml) ? `PAGE@${/<w:jc w:val="(\w+)"/.exec(partXml)?.[1] ?? '?'}` : '-'

		return [...xml.matchAll(/<w:sectPr[\s\S]*?<\/w:sectPr>/g)].map(([sectPr]) => {
			const parts: Record<string, string> = {}
			for (const [, kind, type, id] of sectPr.matchAll(
				/<w:(header|footer)Reference w:type="(\w+)" r:id="(\w+)"/g,
			)) {
				parts[`${kind}.${type}`] = numberIn(part(id))
			}
			return {
				pgNumType: /<w:pgNumType[^>]*\/>/.exec(sectPr)?.[0] ?? null,
				titlePg: /<w:titlePg/.test(sectPr),
				parts,
			}
		})
	}

	test('bagian depan satu section; badan naskah satu section per bab', async () => {
		const sections = await sectionsOf()
		expect(sections).toHaveLength(3)
		expect(sections[0].pgNumType).toContain('lowerRoman')
		// BAB I mulai 1 - tanpa `start`, Word melanjutkan hitungan romawi.
		expect(sections[1].pgNumType).toMatch(/w:start="1"/)
		expect(sections[2].pgNumType ?? '').not.toMatch(/w:start/)
		expect(sections.every((section) => section.titlePg)).toBe(true)
	})

	test('sampul tanpa nomor, bagian depan tengah bawah, bab: pembuka tengah bawah, lainnya kanan atas', async () => {
		const [front, bab1, bab2] = await sectionsOf()
		expect(front.parts['footer.first']).toBe('-')
		expect(front.parts['footer.default']).toBe('PAGE@center')
		expect(front.parts['header.default']).toBe('-')
		for (const bab of [bab1, bab2]) {
			expect(bab.parts['footer.first']).toBe('PAGE@center')
			expect(bab.parts['header.first']).toBe('-')
			expect(bab.parts['header.default']).toBe('PAGE@right')
			expect(bab.parts['footer.default']).toBe('-')
		}
	})
})

/* Surat lamaran: titik dua blok data sejajar lewat tab stop di Word juga. */
describe('tab stop di DOCX', () => {
	test('posisi tab stop dalam twip dari pt (1 pt = 20 twip), dan tab jadi <w:tab/>', async () => {
		const doc = buildSchema().nodeFromJSON({
			type: 'doc',
			content: [
				{
					type: 'paragraph',
					attrs: { tabStops: [{ posPt: 120, type: 'left' }] },
					content: [{ type: 'text', text: 'Nama' }, { type: 'tab' }, { type: 'text', text: ': A' }],
				},
			],
		})
		const blob = await exportDocx(doc, { title: 'uji', geometry: pageGeometry(DEFAULT_PAGE_SETUP) })
		const xml = strFromU8(unzipSync(new Uint8Array(await blob.arrayBuffer()))['word/document.xml'])
		expect(xml).toMatch(/<w:tab w:val="left" w:pos="2400"\/>/)
		expect(xml).toContain('<w:tab/>')
	})
})
