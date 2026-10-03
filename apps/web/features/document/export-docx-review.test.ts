/*
 * Tinjauan XSD (ISO/IEC 29500-4) atas berkas hasil ekspor DOCX, putaran 2:
 * setiap butir temuan tinjauan diperiksa di XML-nya. Satu `describe` per butir.
 */
import { describe, expect, test } from 'bun:test'
import { getSchema, type JSONContent } from '@tiptap/core'
import type { Node as PMNode, Schema } from '@tiptap/pm/model'
import { EditorState } from '@tiptap/pm/state'
import { CellSelection, mergeCells, TableMap } from '@tiptap/pm/tables'
import type { DocumentTypography } from '@writer-hub/shared'
import { DOMParser } from '@xmldom/xmldom'
import { strFromU8, unzipSync } from 'fflate'
import { buildEditorExtensions } from '@/features/editor/extensions'
import { Footnote, FootnoteRef } from '@/features/editor/footnote'
import { DEFAULT_PAGE_SETUP, type PageSetup, pageGeometry } from '@/features/editor/page-geometry'
import { buildSchema } from '@/features/sync/serialize'
import { createXmlParser } from './docx/xml'
import { exportDocx } from './export-docx'
import { LatexToOmml } from './export-docx-math'
import { renumberIds, stripInvalidXmlChars } from './export-docx-post'
import { tocAttrsOf } from './export-docx-toc'

const PNG_1PX =
	'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

/** Karakter dari kodenya - menulis escape-nya langsung di sumber mudah keliru. */
const chr = (...codes: number[]) => String.fromCharCode(...codes)

/** Karakter yang tidak sah di XML 1.0 (sama dengan validate.py tinjauan). */
const INVALID = new RegExp(
	`[${chr(0)}-${chr(8)}${chr(11)}${chr(12)}${chr(14)}-${chr(31)}${chr(0xfffe)}${chr(0xffff)}]`,
)

async function exportFiles(
	doc: PMNode,
	options: { setup?: PageSetup; typography?: DocumentTypography; title?: string } = {},
): Promise<Record<string, string>> {
	const setup = options.setup ?? DEFAULT_PAGE_SETUP
	const blob = await exportDocx(doc, {
		title: options.title ?? 'uji',
		geometry: pageGeometry(setup),
		setup,
		...(options.typography ? { typography: options.typography } : {}),
	})
	return Object.fromEntries(
		Object.entries(unzipSync(new Uint8Array(await blob.arrayBuffer())))
			.filter(([name]) => name.endsWith('.xml') || name.endsWith('.rels'))
			.map(([name, data]) => [name, strFromU8(data)]),
	)
}

const exported = (content: JSONContent[], options: Parameters<typeof exportFiles>[1] = {}) =>
	exportFiles(buildSchema().nodeFromJSON({ type: 'doc', content }), options)

const text = (value: string, marks?: JSONContent['marks']): JSONContent => ({
	type: 'text',
	text: value,
	...(marks ? { marks } : {}),
})
const paragraph = (value: string): JSONContent => ({ type: 'paragraph', content: value ? [text(value)] : [] })
const listItem = (...content: JSONContent[]): JSONContent => ({ type: 'listItem', content })

/** XML paragraf Word yang memuat penanda itu. */
const paragraphWith = (xml: string, marker: string) => {
	const at = xml.indexOf(marker)
	const start = Math.max(xml.lastIndexOf('<w:p>', at), xml.lastIndexOf('<w:p ', at))
	return xml.slice(start, xml.indexOf('</w:p>', at) + 6)
}

describe('1 · karakter kontrol tidak membuat XML rusak', () => {
	test('teks, alt, daftar isi, watermark, dan judul berkarakter kontrol tetap well-formed', async () => {
		const dirty = `a${chr(1)}b${chr(12)}c${chr(0xfffe)}d`
		const files = await exported(
			[
				{ type: 'tocBlock', attrs: { listKind: 'isi', snapshot: `Judul${chr(3)}\t1` } },
				{ type: 'paragraph', content: [text(dirty), text(`baris${chr(11)}lanjut`)] },
				{ type: 'image', attrs: { src: PNG_1PX, width: 20, height: 20, alt: `alt${chr(2)}` } },
				{ type: 'codeBlock', attrs: { language: 'js' }, content: [text(`x${chr(7)}y`)] },
			],
			{
				title: `judul${chr(5)}`,
				setup: {
					...DEFAULT_PAGE_SETUP,
					watermark: {
						kind: 'text',
						text: `RAHASIA${chr(4)}`,
						anchor: 'center',
						offsetX: 0,
						offsetY: 0,
						scale: 0.6,
						opacity: 0.15,
						rotation: -45,
					},
				},
			},
		)
		const errors: string[] = []
		for (const [name, xml] of Object.entries(files)) {
			if (INVALID.test(xml)) errors.push(`${name}: karakter tak sah`)
			new DOMParser({
				onError: (level: string, message: string) => {
					if (level !== 'warning') errors.push(`${name}: ${message}`)
				},
			}).parseFromString(xml, 'text/xml')
		}
		expect(errors).toEqual([])
		// Dua simpul teks bermark sama dilebur ProseMirror menjadi satu run.
		expect(files['word/document.xml']).toContain('>abcdbaris<')
		// VT dari papan klip Word adalah baris baru, bukan karakter yang dibuang.
		expect(paragraphWith(files['word/document.xml'], 'abcdbaris')).toMatch(
			/abcdbaris<\/w:t><\/w:r><w:r><w:br\/><\/w:r><w:r><w:t[^>]*>lanjut/,
		)
	})

	test('rujukan karakter ke kode tak sah ikut dibuang, yang sah dibiarkan', () => {
		expect(stripInvalidXmlChars(`<w:t>a&#1;b&#x1F;c&#9;d&#x41;e${chr(0)}</w:t>`)).toBe(
			'<w:t>abc&#9;d&#x41;e</w:t>',
		)
	})
})

describe('2 · w:ind tidak menulis firstLine dan hanging bersamaan', () => {
	const typography = (firstLinePt: number): DocumentTypography => ({
		baseFont: { family: '"Times New Roman", Times, serif', sizePt: 12 },
		lineHeight: 1.5,
		paragraph: { align: 'justify', firstLinePt },
		headings: { 7: { firstLinePt } },
	})
	const indents = (xml: string) => [...xml.matchAll(/<w:ind [^>]*\/>/g)].map((match) => match[0])

	test('lekukan baris pertama skripsi (28 pt) tertulis sebagai firstLine saja', async () => {
		const files = await exported([paragraph('badan')], { typography: typography(28) })
		const styles = files['word/styles.xml']
		const defaults = /<w:docDefaults>[\s\S]*?<\/w:docDefaults>/.exec(styles)?.[0] ?? ''
		expect(defaults).toContain('w:firstLine="560"')
		expect(defaults).not.toContain('w:hanging')
		expect(indents(styles).filter((ind) => ind.includes('w:firstLine') && ind.includes('w:hanging'))).toEqual(
			[],
		)
	})

	test('lekukan menggantung tertulis sebagai hanging saja; nol tidak menulis keduanya', async () => {
		const hanging = (await exported([paragraph('x')], { typography: typography(-18) }))['word/styles.xml']
		expect(hanging).toContain('w:hanging="360"')
		expect(
			indents(hanging).filter((ind) => ind.includes('w:firstLine') && ind.includes('w:hanging')),
		).toEqual([])
		const none = (await exported([paragraph('x')], { typography: typography(0) }))['word/styles.xml']
		expect(indents(none).some((ind) => ind.includes('w:firstLine') || ind.includes('w:hanging'))).toBe(false)
	})
})

describe('3 · tanpa w:highlightCs', () => {
	test('sorotan palet Word hanya menulis w:highlight', async () => {
		const files = await exported([
			{ type: 'paragraph', content: [text('stabilo', [{ type: 'highlight', attrs: { color: '#ffff00' } }])] },
		])
		expect(files['word/document.xml']).toContain('<w:highlight w:val="yellow"/>')
		expect(files['word/document.xml']).not.toContain('highlightCs')
	})
})

describe('4 · gabung sel melintasi baris utuh', () => {
	const W_TR = /<w:tr>([\s\S]*?)<\/w:tr>/g
	/** Kolom kisi yang ditempati tiap baris (sel lanjutan vMerge ikut dihitung). */
	const rowWidths = (xml: string) =>
		[...xml.matchAll(W_TR)].map((row) =>
			[...row[1].matchAll(/<w:tc>([\s\S]*?)<\/w:tc>/g)].reduce(
				(sum, cell) => sum + Number(/<w:gridSpan w:val="(\d+)"\/>/.exec(cell[1])?.[1] ?? 1),
				0,
			),
		)
	const cell = (value: string, attrs: Record<string, unknown> = {}): JSONContent => ({
		type: 'tableCell',
		attrs,
		content: [paragraph(value)],
	})

	test('gabung 2×2 di tabel dua kolom: baris tertutup tidak menggeser sel e/f ke luar kisi', async () => {
		const schema = buildSchema()
		const doc = schema.nodeFromJSON({
			type: 'doc',
			content: [
				{
					type: 'table',
					content: [
						{ type: 'tableRow', content: [cell('a'), cell('b')] },
						{ type: 'tableRow', content: [cell('c'), cell('d')] },
						{ type: 'tableRow', content: [cell('e'), cell('f')] },
					],
				},
			],
		})
		const map = TableMap.get(doc.child(0))
		let state = EditorState.create({ doc })
		state = state.apply(
			state.tr.setSelection(CellSelection.create(state.doc, 1 + map.map[0], 1 + map.map[3])),
		)
		mergeCells(state, (tr) => {
			state = state.apply(tr)
		})
		// Prasyarat: prosemirror-tables memang meninggalkan baris kosong.
		expect(state.doc.child(0).child(1).childCount).toBe(0)

		const xml = (await exportFiles(state.doc))['word/document.xml']
		const columns = (xml.match(/<w:gridCol /g) ?? []).length
		expect(columns).toBe(2)
		expect(rowWidths(xml)).toEqual([2, 2])
		expect(xml).not.toContain('w:vMerge')
	})

	test('rowspan melewati ujung tabel dipotong ke baris yang ada', async () => {
		const xml = (
			await exported([
				{
					type: 'table',
					content: [
						{ type: 'tableRow', content: [cell('a', { rowspan: 3 }), cell('b')] },
						{ type: 'tableRow', content: [cell('c')] },
					],
				},
			])
		)['word/document.xml']
		expect(rowWidths(xml)).toEqual([2, 2])
		expect(xml.match(/<w:vMerge w:val="continue"\/>/g) ?? []).toHaveLength(1)
	})

	test('tabel yang semua barisnya kosong tidak menjadi w:tbl tanpa w:tr', async () => {
		const xml = (
			await exported([{ type: 'table', content: [{ type: 'tableRow', content: [] }] }, paragraph('x')])
		)['word/document.xml']
		expect(xml).not.toContain('<w:tbl>')
		expect(xml).toContain('>x<')
	})
})

describe('5 · matriks kosong jatuh ke teks', () => {
	test('matrix/pmatrix kosong tidak terpetakan, diekspor sebagai LaTeX lebar-tetap', async () => {
		const parse = await createXmlParser()
		expect(LatexToOmml.convert('\\begin{matrix}\\end{matrix}', true, parse)).toBeNull()
		expect(LatexToOmml.convert('\\begin{pmatrix}\\end{pmatrix}', true, parse)).toBeNull()
		const xml = (await exported([{ type: 'mathBlock', attrs: { latex: '\\begin{matrix}\\end{matrix}' } }]))[
			'word/document.xml'
		]
		expect(xml).not.toContain('<m:eqArr/>')
		expect(xml).not.toContain('<m:oMath>')
		expect(xml).toContain('begin{matrix}')
	})
})

describe('6 · id wp:docPr dan penanda unik', () => {
	test('dua belas ubin watermark dan gambar naskah mendapat id wp:docPr berbeda', async () => {
		const files = await exported(
			[
				{ type: 'image', attrs: { src: PNG_1PX, width: 20, height: 20 } },
				{ type: 'image', attrs: { src: PNG_1PX, width: 30, height: 30 } },
			],
			{
				setup: {
					...DEFAULT_PAGE_SETUP,
					watermark: {
						kind: 'image',
						imageDataUrl: PNG_1PX,
						assetId: 'a',
						anchor: 'tile',
						offsetX: 0,
						offsetY: 0,
						scale: 0.6,
						opacity: 0.3,
						rotation: 0,
					},
				},
			},
		)
		const ids = Object.values(files).flatMap((xml) =>
			[...xml.matchAll(/<wp:docPr [^>]*?id="(\d+)"/g)].map((match) => match[1]),
		)
		expect(ids.length).toBe(14)
		expect(new Set(ids).size).toBe(ids.length)
	})

	test('penanda judul daftar isi bernomor unik, awal dan akhirnya berpasangan', async () => {
		const heading = (value: string): JSONContent => ({
			type: 'heading',
			attrs: { level: 1 },
			content: [text(value)],
		})
		const xml = (
			await exported([
				{ type: 'tocBlock', attrs: { listKind: 'isi', snapshot: 'Satu\t1\nDua\t1\nTiga\t1' } },
				heading('Satu'),
				heading('Dua'),
				heading('Tiga'),
			])
		)['word/document.xml']
		const starts = [...xml.matchAll(/<w:bookmarkStart [^>]*?w:id="(\d+)"/g)].map((match) => match[1])
		const ends = [...xml.matchAll(/<w:bookmarkEnd [^>]*?w:id="(\d+)"/g)].map((match) => match[1])
		expect(starts).toEqual(['1', '2', '3'])
		expect(ends).toEqual(starts)
	})

	test('penomoran ulang mengikuti sarang penanda (LIFO) dan berlanjut lintas part', () => {
		const parts = new Map([
			[
				'word/document.xml',
				'<w:bookmarkStart w:id="1" w:name="a"/><w:bookmarkStart w:id="1" w:name="b"/><w:bookmarkEnd w:id="1"/><w:bookmarkEnd w:id="1"/>',
			],
			['word/header1.xml', '<w:bookmarkStart w:id="1" w:name="c"/><w:bookmarkEnd w:id="1"/>'],
		])
		renumberIds(parts)
		expect(parts.get('word/document.xml')).toBe(
			'<w:bookmarkStart w:id="1" w:name="a"/><w:bookmarkStart w:id="2" w:name="b"/><w:bookmarkEnd w:id="2"/><w:bookmarkEnd w:id="1"/>',
		)
		expect(parts.get('word/header1.xml')).toBe(
			'<w:bookmarkStart w:id="3" w:name="c"/><w:bookmarkEnd w:id="3"/>',
		)
	})
})

describe('7 · blok teks selain paragraf di dalam daftar, centang, dan callout', () => {
	const code = (value: string): JSONContent => ({
		type: 'codeBlock',
		attrs: { language: 'js' },
		content: [text(value)],
	})

	test('blok kode di butir daftar tetap berhuruf lebar-tetap dan menjorok', async () => {
		const xml = (
			await exported([
				{ type: 'bulletList', content: [listItem(paragraph('butir'), code('let kodeDaftar = 1'))] },
			])
		)['word/document.xml']
		const line = paragraphWith(xml, 'let kodeDaftar = 1')
		expect(line).toContain('Consolas')
		expect(line).not.toContain('<w:numPr>')
		expect(Number(/w:left="(\d+)"/.exec(line)?.[1])).toBe(360)
	})

	test('blok kode di butir centang dan di awal callout tetap berhuruf lebar-tetap', async () => {
		const xml = (
			await exported([
				{
					type: 'taskList',
					content: [
						{
							type: 'taskItem',
							attrs: { checked: false },
							content: [paragraph('tugas'), code('kodeTugas()')],
						},
					],
				},
				{ type: 'callout', attrs: { calloutType: 'info', emoji: 'i' }, content: [code('kodeCallout()')] },
			])
		)['word/document.xml']
		expect(paragraphWith(xml, 'kodeTugas()')).toContain('Consolas')
		expect(paragraphWith(xml, 'kodeCallout()')).toContain('Consolas')
		// Ikon callout di paragrafnya sendiri, bukan ditempel ke baris kode.
		expect(paragraphWith(xml, 'kodeCallout()')).not.toContain('>i <')
	})

	test('isi catatan kaki lama di dalam butir daftar tidak tercetak dua kali', async () => {
		const files = await exported([
			{
				type: 'bulletList',
				content: [
					listItem(
						{ type: 'paragraph', content: [text('butir'), { type: 'footnoteRef', attrs: { id: 'x' } }] },
						{ type: 'footnote', content: [text('isi catatan di butir')] },
					),
				],
			},
		])
		expect(files['word/document.xml']).not.toContain('isi catatan di butir')
		expect(files['word/footnotes.xml']).toContain('isi catatan di butir')
	})
})

describe('8 · butir kecil', () => {
	test('daftar bernomor bersarang mempertahankan start-nya', async () => {
		const files = await exported([
			{
				type: 'orderedList',
				content: [
					listItem(paragraph('induk'), {
						type: 'orderedList',
						attrs: { start: 3 },
						content: [listItem(paragraph('anak tiga'))],
					}),
				],
			},
		])
		const numbering = files['word/numbering.xml']
		const abstracts = [...numbering.matchAll(/<w:abstractNum [\s\S]*?<\/w:abstractNum>/g)].map(
			(match) => match[0],
		)
		const withThree = abstracts.find((abstract) =>
			/<w:lvl w:ilvl="1"[^>]*>\s*<w:start w:val="3"\/>/.test(abstract),
		)
		expect(withThree).toBeDefined()
	})

	test('daftar bernomor bersarang tanpa gaya: 1. lalu a. lalu i., seperti kanvas', async () => {
		const files = await exported([
			{
				type: 'orderedList',
				content: [
					listItem(paragraph('satu'), {
						type: 'orderedList',
						content: [listItem(paragraph('a'), { type: 'orderedList', content: [listItem(paragraph('i'))] })],
					}),
				],
			},
		])
		const numbering = files['word/numbering.xml']
		const plain = [...numbering.matchAll(/<w:abstractNum [\s\S]*?<\/w:abstractNum>/g)]
			.map((match) => match[0])
			.find((abstract) => /<w:lvl w:ilvl="1"[^>]*>[\s\S]*?<w:numFmt w:val="lowerLetter"\/>/.test(abstract))
		expect(plain).toBeDefined()
		expect(plain).toMatch(/<w:lvl w:ilvl="0"[^>]*>[\s\S]*?<w:numFmt w:val="decimal"\/>/)
		expect(plain).toMatch(/<w:lvl w:ilvl="2"[^>]*>[\s\S]*?<w:numFmt w:val="lowerRoman"\/>/)
	})

	test('gambar blok HTML di dalam kutipan diperkecil ke lebar yang tersisa', async () => {
		const xml = (
			await exported([
				{
					type: 'blockquote',
					content: [
						{
							type: 'htmlBlock',
							attrs: { snapshot: PNG_1PX, snapshotWidth: 2000, snapshotHeight: 100, fit: 'embed' },
						},
					],
				},
			])
		)['word/document.xml']
		const width = Number(/<wp:extent cx="(\d+)"/.exec(xml)?.[1]) / 9525
		expect(width).toBeLessThanOrEqual(pageGeometry(DEFAULT_PAGE_SETUP).contentWidth - 18)
	})

	test('hentian halaman satu w:br type="page", tanpa baris kosong tambahan', async () => {
		const xml = (await exported([paragraph('sebelum'), { type: 'pageBreak' }, paragraph('sesudah')]))[
			'word/document.xml'
		]
		expect(xml).toContain('<w:br w:type="page"/>')
		expect(xml).not.toContain('<w:pageBreakBefore/>')
		expect(xml).not.toContain('<w:br/>')
	})

	test('atribut daftar isi rusak diperiksa, ekspornya tetap jadi', async () => {
		const attrs = tocAttrsOf({ minLevel: 'x', maxLevel: null, indentPerLevel: 'abc', tabLeader: 'toString' })
		expect(attrs).toMatchObject({ minLevel: 1, maxLevel: 3, indentPerLevel: 19, tabLeader: 'dots' })
		const files = await exported([
			{ type: 'tocBlock', attrs: { listKind: 'isi', indentPerLevel: Number.NaN, snapshot: 'A\t1' } },
			{ type: 'heading', attrs: { level: 1 }, content: [text('A')] },
		])
		expect(files['word/document.xml']).toContain('TOC')
	})
})

/*
 * Model catatan kaki sekarang: isinya menumpang di `footnoteRef.attrs.content`.
 * Skema uji ini menambahkan atribut itu (dan `id` pada node `footnote` lama)
 * supaya uji tidak bergantung pada urutan merge perubahan skema editor.
 */
describe('TKS-1 · catatan kaki: isi di rujukan, lalu pasangan lama', () => {
	const schema: Schema = getSchema([
		...buildEditorExtensions().filter((extension) => !['footnote', 'footnoteRef'].includes(extension.name)),
		Footnote.extend({
			addAttributes() {
				return { ...this.parent?.(), id: { default: null } }
			},
		}),
		FootnoteRef.extend({
			addAttributes() {
				return { ...this.parent?.(), content: { default: [] } }
			},
		}),
	])
	const ref = (id: string | null, content: JSONContent[] = []): JSONContent => ({
		type: 'footnoteRef',
		attrs: { id, content },
	})
	const legacy = (id: string | null, value: string): JSONContent => ({
		type: 'footnote',
		attrs: { id },
		content: [text(value)],
	})
	const footnotesOf = (xml: string) =>
		new Map(
			[...xml.matchAll(/<w:footnote w:id="(\d+)">([\s\S]*?)<\/w:footnote>/g)].map(
				(match) => [Number(match[1]), match[2]] as const,
			),
		)
	const run = async (content: JSONContent[]) => exportFiles(schema.nodeFromJSON({ type: 'doc', content }))

	test('isi di rujukan menjadi catatan kaki, lengkap dengan formatnya', async () => {
		const files = await run([
			{
				type: 'paragraph',
				content: [text('kalimat'), ref('fn-1', [text('Sumber '), text('tebal', [{ type: 'bold' }])])],
			},
		])
		const note = footnotesOf(files['word/footnotes.xml']).get(1) ?? ''
		expect(note).toContain('Sumber ')
		expect(/<w:r><w:rPr><w:b\/>[\s\S]*?>tebal</.test(note)).toBe(true)
		expect(files['word/document.xml']).not.toContain('tebal')
	})

	test('rujukan tanpa isi memakai node footnote lama ber-id sama, dalam urutan apa pun', async () => {
		const files = await run([
			{ type: 'paragraph', content: [text('a'), ref('b'), text('c'), ref('a')] },
			legacy('a', 'catatan A'),
			legacy('b', 'catatan B'),
		])
		const notes = footnotesOf(files['word/footnotes.xml'])
		expect(notes.get(1)).toContain('catatan B')
		expect(notes.get(2)).toContain('catatan A')
		expect(files['word/document.xml']).not.toContain('catatan')
	})

	test('node footnote lama tanpa id dipasangkan menurut urutan', async () => {
		const files = await run([
			{ type: 'paragraph', content: [text('a'), ref('x'), text('b'), ref('y')] },
			legacy(null, 'pertama'),
			legacy(null, 'kedua'),
		])
		const notes = footnotesOf(files['word/footnotes.xml'])
		expect(notes.get(1)).toContain('pertama')
		expect(notes.get(2)).toContain('kedua')
	})

	test('rujukan kosong tanpa pasangan menjadi catatan kosong; isi di rujukan menang atas node lama', async () => {
		const files = await run([
			{ type: 'paragraph', content: [text('a'), ref('kosong'), text('b'), ref('dua', [text('isi baru')])] },
			legacy('dua', 'isi lama'),
		])
		const notes = footnotesOf(files['word/footnotes.xml'])
		expect(notes.get(1)).not.toContain('<w:t xml:space="preserve">isi')
		expect(notes.get(2)).toContain('isi baru')
		// Node lama milik rujukan yang sudah berisi tidak tercetak di naskah.
		expect(files['word/document.xml']).not.toContain('isi lama')
		expect(files['word/footnotes.xml']).not.toContain('isi lama')
	})
})
