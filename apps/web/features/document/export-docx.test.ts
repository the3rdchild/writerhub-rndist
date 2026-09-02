import { describe, expect, test } from 'bun:test'
import type { JSONContent } from '@tiptap/core'
import type { DocumentTypography } from '@writer-hub/shared'
import { strFromU8, unzipSync } from 'fflate'
import { PAGE_BREAK_NODE } from '@/features/editor/page-break'
import { DEFAULT_PAGE_SETUP, type PageSetup, pageGeometry } from '@/features/editor/page-geometry'
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
