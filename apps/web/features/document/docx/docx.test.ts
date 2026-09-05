import { describe, expect, test } from 'bun:test'
import type { JSONContent } from '@tiptap/core'
import { strToU8, zipSync } from 'fflate'
import { readDocx } from './index'

const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"'
const R = 'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"'
const M = 'xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math"'
const REL_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'

function docx({
	body,
	styles = '',
	rels = '',
	theme,
	numbering,
	media,
}: {
	body: string
	styles?: string
	rels?: string
	theme?: { major: string; minor: string }
	numbering?: string
	media?: Record<string, Uint8Array>
}): Uint8Array {
	const mediaPart = media
		? Object.fromEntries(
				Object.entries(media).map(([path, bytes]) => [
					path.startsWith('word/') ? path : `word/${path}`,
					bytes,
				]),
			)
		: {}
	const numberingRel = numbering
		? `<Relationship Id="rIdNum" Type="${REL_NS}/numbering" Target="numbering.xml"/>`
		: ''
	const numberingPart = numbering
		? {
				'word/numbering.xml': strToU8(`<?xml version="1.0"?><w:numbering ${W}>${numbering}</w:numbering>`),
			}
		: {}

	const themeRel = theme
		? `<Relationship Id="rIdTheme" Type="${REL_NS}/theme" Target="theme/theme1.xml"/>`
		: ''
	const themePart = theme
		? {
				'word/theme/theme1.xml': strToU8(
					`<?xml version="1.0"?><a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:themeElements><a:fontScheme>
					<a:majorFont><a:latin typeface="${theme.major}"/></a:majorFont>
					<a:minorFont><a:latin typeface="${theme.minor}"/></a:minorFont>
					</a:fontScheme></a:themeElements></a:theme>`,
				),
			}
		: {}

	return zipSync({
		...mediaPart,
		...themePart,
		...numberingPart,
		'_rels/.rels': strToU8(
			`<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
			<Relationship Id="rId1" Type="${REL_NS}/officeDocument" Target="word/document.xml"/>
			</Relationships>`,
		),
		'word/_rels/document.xml.rels': strToU8(
			`<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
			<Relationship Id="rIdStyles" Type="${REL_NS}/styles" Target="styles.xml"/>
			${themeRel}
			${numberingRel}
			${rels}
			</Relationships>`,
		),
		'word/styles.xml': strToU8(`<?xml version="1.0"?><w:styles ${W}>${styles}</w:styles>`),
		'word/document.xml': strToU8(
			`<?xml version="1.0"?><w:document ${W} ${R} ${M}><w:body>${body}</w:body></w:document>`,
		),
	})
}

function p(content: string, pPr = ''): string {
	return `<w:p>${pPr ? `<w:pPr>${pPr}</w:pPr>` : ''}${content}</w:p>`
}

function r(text: string, rPr = ''): string {
	return `<w:r>${rPr ? `<w:rPr>${rPr}</w:rPr>` : ''}<w:t xml:space="preserve">${text}</w:t></w:r>`
}

function blocks(document: JSONContent): JSONContent[] {
	return document.content ?? []
}

function textOf(node: JSONContent | undefined): string {
	if (!node) return ''
	if (node.type === 'text') return node.text ?? ''
	return (node.content ?? []).map(textOf).join('')
}

function marksOf(block: JSONContent | undefined, index = 0): string[] {
	const run = block?.content?.[index]
	return (run?.marks ?? []).map((mark) => mark.type).filter((type) => type !== 'textStyle')
}

function markNamed(block: JSONContent | undefined, type: string, index = 0) {
	return block?.content?.[index]?.marks?.find((mark) => mark.type === type)
}

describe('teks dan penekanan', () => {
	test('paragraf berurutan terbaca apa adanya', async () => {
		const result = await readDocx(docx({ body: p(r('Satu')) + p(r('Dua')) }))
		const body = blocks(result.content)

		expect(body).toHaveLength(2)
		expect(textOf(body[0])).toBe('Satu')
		expect(textOf(body[1])).toBe('Dua')
	})

	test('tebal dan miring langsung pada run ikut terbawa', async () => {
		const result = await readDocx(docx({ body: p(r('tegas', '<w:b/><w:i/>')) }))
		expect(marksOf(blocks(result.content)[0])).toEqual(['bold', 'italic'])
	})

	test('run yang membatalkan tebal warisan tidak jadi tebal', async () => {
		const styles = `<w:style w:type="paragraph" w:styleId="Tebal"><w:name w:val="Tebal"/><w:rPr><w:b/></w:rPr></w:style>`
		const result = await readDocx(
			docx({
				styles,
				body: p(r('normal', '<w:b w:val="0"/>'), '<w:pStyle w:val="Tebal"/>'),
			}),
		)
		expect(marksOf(blocks(result.content)[0])).toEqual([])
	})

	test('garis bawah bernilai none tidak menghasilkan mark', async () => {
		const result = await readDocx(docx({ body: p(r('polos', '<w:u w:val="none"/>')) }))
		expect(marksOf(blocks(result.content)[0])).toEqual([])
	})
})

describe('sifat yang diwarisi dari definisi gaya', () => {
	const CAPTION = `
		<w:style w:type="paragraph" w:styleId="Caption"><w:name w:val="caption"/><w:rPr><w:i/></w:rPr></w:style>
		<w:style w:type="paragraph" w:styleId="CaptionTabel">
			<w:name w:val="Caption Tabel"/><w:basedOn w:val="Caption"/>
			<w:pPr><w:jc w:val="center"/></w:pPr>
			<w:rPr><w:b/><w:i w:val="0"/></w:rPr>
		</w:style>`

	test('tebal dari gaya sampai ke teksnya', async () => {
		const result = await readDocx(
			docx({ styles: CAPTION, body: p(r('Tabel 1.1'), '<w:pStyle w:val="CaptionTabel"/>') }),
		)
		expect(marksOf(blocks(result.content)[0])).toContain('bold')
	})

	test('gaya turunan boleh membatalkan sifat induknya', async () => {
		const result = await readDocx(
			docx({ styles: CAPTION, body: p(r('Tabel 1.1'), '<w:pStyle w:val="CaptionTabel"/>') }),
		)
		expect(marksOf(blocks(result.content)[0])).not.toContain('italic')
	})

	test('rantai basedOn yang melingkar tidak menggantung', async () => {
		const styles = `
			<w:style w:type="paragraph" w:styleId="A"><w:name w:val="A"/><w:basedOn w:val="B"/></w:style>
			<w:style w:type="paragraph" w:styleId="B"><w:name w:val="B"/><w:basedOn w:val="A"/></w:style>`
		const result = await readDocx(docx({ styles, body: p(r('tetap ada'), '<w:pStyle w:val="A"/>') }))
		expect(textOf(blocks(result.content)[0])).toBe('tetap ada')
	})
})

describe('judul', () => {
	const HEADINGS = `
		<w:style w:type="paragraph" w:styleId="Heading1">
			<w:name w:val="heading 1"/><w:pPr><w:outlineLvl w:val="0"/></w:pPr>
		</w:style>
		<w:style w:type="paragraph" w:styleId="Headingawal">
			<w:name w:val="Heading awal"/><w:basedOn w:val="Heading1"/>
			<w:pPr><w:numPr><w:numId w:val="0"/></w:numPr></w:pPr>
		</w:style>`

	test('gaya bernama "heading 1" jadi judul tingkat satu', async () => {
		const result = await readDocx(
			docx({ styles: HEADINGS, body: p(r('Pendahuluan'), '<w:pStyle w:val="Heading1"/>') }),
		)
		const block = blocks(result.content)[0]
		expect(block?.type).toBe('heading')
		expect(block?.attrs?.level).toBe(1)
	})
	test('turunan heading tetap dikenali meski namanya bebas', async () => {
		const result = await readDocx(
			docx({ styles: HEADINGS, body: p(r('BAB I'), '<w:pStyle w:val="Headingawal"/>') }),
		)
		const block = blocks(result.content)[0]
		expect(block?.type).toBe('heading')
		expect(block?.attrs?.level).toBe(1)
	})

	test('gaya tanpa outlineLvl dikenali dari namanya', async () => {
		const styles = `<w:style w:type="paragraph" w:styleId="H2"><w:name w:val="heading 2"/></w:style>`
		const result = await readDocx(docx({ styles, body: p(r('Latar'), '<w:pStyle w:val="H2"/>') }))
		expect(blocks(result.content)[0]?.attrs?.level).toBe(2)
	})

	test('outlineLvl 9 berarti teks isi, bukan judul', async () => {
		const result = await readDocx(docx({ body: p(r('biasa'), '<w:outlineLvl w:val="9"/>') }))
		expect(blocks(result.content)[0]?.type).toBe('paragraph')
	})
})

describe('field', () => {
	test('field TOC diganti node daftar isi yang hidup', async () => {
		const field = `
			<w:r><w:fldChar w:fldCharType="begin"/></w:r>
			<w:r><w:instrText xml:space="preserve"> TOC \\o "1-4" \\h </w:instrText></w:r>
			<w:r><w:fldChar w:fldCharType="separate"/></w:r>
			${r('BAB I PENDAHULUAN')}
			<w:r><w:fldChar w:fldCharType="end"/></w:r>`
		const result = await readDocx(docx({ body: p(field) }))

		const block = blocks(result.content)[0]
		expect(block?.type).toBe('tocBlock')
		expect(block?.attrs?.listKind).toBe('isi')
		expect(block?.attrs?.maxLevel).toBe(4)
	})

	test('field tanpa hasil tersimpan tidak menelan paragraf sesudahnya', async () => {
		const field = `
			<w:r><w:fldChar w:fldCharType="begin"/></w:r>
			<w:r><w:instrText xml:space="preserve"> PAGE </w:instrText></w:r>
			<w:r><w:fldChar w:fldCharType="end"/></w:r>`
		const result = await readDocx(docx({ body: p(field) + p(r('lanjut')) }))

		expect(textOf(blocks(result.content)[1])).toBe('lanjut')
	})
})

describe('revisi dan tautan', () => {
	test('teks yang dihapus tidak ikut, yang disisipkan ikut', async () => {
		const body = p(`<w:ins>${r('baru')}</w:ins><w:del><w:r><w:delText>lama</w:delText></w:r></w:del>`)
		expect(textOf(blocks((await readDocx(docx({ body }))).content)[0])).toBe('baru')
	})

	test('tautan ke luar dokumen membawa alamatnya', async () => {
		const rels = `<Relationship Id="rId9" Type="${REL_NS}/hyperlink" Target="https://contoh.id" TargetMode="External"/>`
		const body = p(`<w:hyperlink r:id="rId9">${r('rujukan')}</w:hyperlink>`)
		const link = markNamed(blocks((await readDocx(docx({ body, rels }))).content)[0], 'link')

		expect(link).toBeDefined()
		expect(link?.attrs?.href).toBe('https://contoh.id')
	})
	test('tautan ke penanda internal hanya menyisakan teksnya', async () => {
		const body = p(`<w:hyperlink w:anchor="_Toc1">${r('Bab I')}</w:hyperlink>`)
		const block = blocks((await readDocx(docx({ body }))).content)[0]

		expect(textOf(block)).toBe('Bab I')
		expect(marksOf(block)).toEqual([])
	})
})

describe('pemisah halaman', () => {
	test('pemisah di tengah paragraf memotongnya jadi dua', async () => {
		const body = p(`${r('sebelum')}<w:r><w:br w:type="page"/></w:r>${r('sesudah')}`)
		const body_ = blocks((await readDocx(docx({ body }))).content)

		expect(body_.map((block) => block.type)).toEqual(['paragraph', 'pageBreak', 'paragraph'])
		expect(textOf(body_[0])).toBe('sebelum')
		expect(textOf(body_[2])).toBe('sesudah')
	})

	test('pageBreakBefore memasang pemisah sebelum paragrafnya', async () => {
		const result = await readDocx(docx({ body: p(r('bab baru'), '<w:pageBreakBefore/>') }))
		expect(blocks(result.content).map((block) => block.type)).toEqual(['pageBreak', 'paragraph'])
	})
})

describe('peringatan', () => {
	test('tabel bersih tidak lagi dilaporkan sebagai hilang', async () => {
		const table = `<w:tbl><w:tr><w:tc>${p(r('sel'))}</w:tc></w:tr></w:tbl>`
		const result = await readDocx(docx({ body: table + table }))

		expect(result.warnings).toEqual([])
	})

	test('sel gabungan tabel tidak lagi dilaporkan hilang', async () => {
		const table = `<w:tbl><w:tr><w:tc><w:tcPr><w:gridSpan w:val="2"/></w:tcPr>${p(r('gabung'))}</w:tc></w:tr></w:tbl>`
		const result = await readDocx(docx({ body: table }))

		expect(result.warnings).toEqual([])
	})

	test('dokumen yang bersih tidak memunculkan peringatan', async () => {
		const result = await readDocx(docx({ body: p(r('halo')) }))
		expect(result.warnings).toEqual([])
	})
})

describe('tabel', () => {
	test('tabel sederhana jadi node table dengan sel berisi paragraf', async () => {
		const table = `<w:tbl><w:tr><w:tc>${p(r('A'))}</w:tc><w:tc>${p(r('B'))}</w:tc></w:tr></w:tbl>`
		const block = blocks((await readDocx(docx({ body: table }))).content)[0]

		expect(block?.type).toBe('table')
		expect(block?.content?.[0]?.type).toBe('tableRow')
		expect(block?.content?.[0]?.content?.map((cell) => cell.type)).toEqual(['tableCell', 'tableCell'])
		expect(textOf(block?.content?.[0]?.content?.[0])).toBe('A')
	})
	test('baris tblHeader jadi tableHeader dan repeatHeader hidup', async () => {
		const table = `<w:tbl>
			<w:tr><w:trPr><w:tblHeader/></w:trPr><w:tc>${p(r('judul'))}</w:tc></w:tr>
			<w:tr><w:tc>${p(r('isi'))}</w:tc></w:tr>
		</w:tbl>`
		const block = blocks((await readDocx(docx({ body: table }))).content)[0]

		expect(block?.content?.[0]?.type).toBe('tableRow')
		expect(block?.content?.[0]?.content?.[0]?.type).toBe('tableHeader')
		expect(block?.content?.[1]?.content?.[0]?.type).toBe('tableCell')
		expect(block?.attrs?.repeatHeader).toBeUndefined()
	})

	test('tabel tanpa baris judul mematikan repeatHeader', async () => {
		const table = `<w:tbl><w:tr><w:tc>${p(r('isi'))}</w:tc></w:tr></w:tbl>`
		const block = blocks((await readDocx(docx({ body: table }))).content)[0]
		expect(block?.attrs?.repeatHeader).toBe(false)
	})
	test('tebal di dalam sel ikut terbawa', async () => {
		const table = `<w:tbl><w:tr><w:tc>${p(r('tegas', '<w:b/>'))}</w:tc></w:tr></w:tbl>`
		const block = blocks((await readDocx(docx({ body: table }))).content)[0]
		const cellParagraph = block?.content?.[0]?.content?.[0]?.content?.[0]
		expect(marksOf(cellParagraph)).toContain('bold')
	})

	test('perataan vertikal sel jadi atribut verticalAlign', async () => {
		const table = `<w:tbl><w:tr><w:tc><w:tcPr><w:vAlign w:val="center"/></w:tcPr>${p(r('isi'))}</w:tc></w:tr></w:tbl>`
		const cell = blocks((await readDocx(docx({ body: table }))).content)[0]?.content?.[0]?.content?.[0]
		expect(cell?.attrs?.verticalAlign).toBe('middle')
	})

	test('margin sel twip jadi cellPadding piksel', async () => {
		const table = `<w:tbl><w:tr><w:tc><w:tcPr><w:tcMar><w:top w:w="60" w:type="dxa"/><w:left w:w="85" w:type="dxa"/></w:tcMar></w:tcPr>${p(r('isi'))}</w:tc></w:tr></w:tbl>`
		const cell = blocks((await readDocx(docx({ body: table }))).content)[0]?.content?.[0]?.content?.[0]
		expect(cell?.attrs?.cellPadding).toBe('4px 0px 0px 6px')
	})

	test('arsir sel (w:shd) jadi backgroundColor', async () => {
		const table = `<w:tbl><w:tr><w:tc><w:tcPr><w:shd w:val="clear" w:fill="D9E2F3"/></w:tcPr>${p(r('isi'))}</w:tc></w:tr></w:tbl>`
		const cell = blocks((await readDocx(docx({ body: table }))).content)[0]?.content?.[0]?.content?.[0]
		expect(cell?.attrs?.backgroundColor).toBe('#d9e2f3')
	})

	test('arsir otomatis atau nil tidak jadi backgroundColor', async () => {
		const table = (fill: string) =>
			`<w:tbl><w:tr><w:tc><w:tcPr><w:shd w:val="clear" w:fill="${fill}"/></w:tcPr>${p(r('isi'))}</w:tc></w:tr></w:tbl>`
		const auto = blocks((await readDocx(docx({ body: table('auto') }))).content)[0]
		expect(auto?.content?.[0]?.content?.[0]?.attrs?.backgroundColor).toBeUndefined()
	})

	test('tcBorders jadi atribut bingkai sel', async () => {
		const table = `<w:tbl><w:tr><w:tc><w:tcPr><w:tcBorders>
			<w:top w:val="single" w:sz="12" w:color="FF0000"/>
			<w:left w:val="none" w:sz="0"/>
		</w:tcBorders></w:tcPr>${p(r('isi'))}</w:tc></w:tr></w:tbl>`
		const cell = blocks((await readDocx(docx({ body: table }))).content)[0]?.content?.[0]?.content?.[0]

		expect(cell?.attrs?.borderWidth).toBe(2)
		expect(cell?.attrs?.borderStyle).toBe('solid')
		expect(cell?.attrs?.borderColor).toBe('#ff0000')
	})

	test('tblBorders jadi atribut bingkai tabel, sisi none dilewati', async () => {
		const table = `<w:tbl><w:tblPr><w:tblBorders>
			<w:top w:val="dotted" w:sz="8" w:color="0000FF"/>
			<w:left w:val="single" w:sz="24" w:color="00FF00"/>
		</w:tblBorders></w:tblPr><w:tr><w:tc>${p(r('isi'))}</w:tc></w:tr></w:tbl>`
		const block = blocks((await readDocx(docx({ body: table }))).content)[0]

		expect(block?.attrs?.borderStyle).toBe('dotted')
		expect(block?.attrs?.borderWidth).toBe(1)
		expect(block?.attrs?.borderColor).toBe('#0000ff')
	})

	test('tblW dxa jadi tableWidth piksel, pct diabaikan', async () => {
		const dxa = `<w:tbl><w:tblPr><w:tblW w:w="4500" w:type="dxa"/></w:tblPr><w:tr><w:tc>${p(r('a'))}</w:tc></w:tr></w:tbl>`
		const pct = `<w:tbl><w:tblPr><w:tblW w:w="5000" w:type="pct"/></w:tblPr><w:tr><w:tc>${p(r('b'))}</w:tc></w:tr></w:tbl>`

		expect(blocks((await readDocx(docx({ body: dxa }))).content)[0]?.attrs?.tableWidth).toBe(300)
		expect(blocks((await readDocx(docx({ body: pct }))).content)[0]?.attrs?.tableWidth).toBeUndefined()
	})

	test('tblInd dxa jadi indentLeft piksel', async () => {
		const table = `<w:tbl><w:tblPr><w:tblInd w:w="720" w:type="dxa"/></w:tblPr><w:tr><w:tc>${p(r('isi'))}</w:tc></w:tr></w:tbl>`
		const block = blocks((await readDocx(docx({ body: table }))).content)[0]
		expect(block?.attrs?.indentLeft).toBe(48)
	})

	test('trHeight jadi rowHeight piksel pada baris', async () => {
		const table = `<w:tbl><w:tr><w:trPr><w:trHeight w:val="600" w:hRule="atLeast"/></w:trPr><w:tc>${p(r('isi'))}</w:tc></w:tr></w:tbl>`
		const row = blocks((await readDocx(docx({ body: table }))).content)[0]?.content?.[0]
		expect(row?.attrs?.rowHeight).toBe(40)
	})

	test('cantSplit pada baris ikut terbawa', async () => {
		const table = `<w:tbl>
			<w:tr><w:trPr><w:cantSplit/></w:trPr><w:tc>${p(r('a'))}</w:tc></w:tr>
			<w:tr><w:tc>${p(r('b'))}</w:tc></w:tr>
		</w:tbl>`
		const block = blocks((await readDocx(docx({ body: table }))).content)[0]

		expect(block?.content?.[0]?.attrs?.cantSplit).toBe(true)
		expect(block?.content?.[1]?.attrs?.cantSplit).toBeUndefined()
	})

	test('tabel rata tengah membawa perataannya', async () => {
		const table = `<w:tbl><w:tblPr><w:jc w:val="center"/></w:tblPr><w:tr><w:tc>${p(r('isi'))}</w:tc></w:tr></w:tbl>`
		const block = blocks((await readDocx(docx({ body: table }))).content)[0]
		expect(block?.attrs?.textAlign).toBe('center')
	})

	test('gridSpan menjadi colspan sel', async () => {
		const table = `<w:tbl><w:tr>
			<w:tc><w:tcPr><w:gridSpan w:val="2"/></w:tcPr>${p(r('lebar'))}</w:tc>
			<w:tc>${p(r('biasa'))}</w:tc>
		</w:tr></w:tbl>`
		const row = blocks((await readDocx(docx({ body: table }))).content)[0]?.content?.[0]

		expect(row?.content?.[0]?.attrs?.colspan).toBe(2)
		expect(row?.content?.[1]?.attrs?.colspan).toBeUndefined()
	})

	test('lebar tblGrid menjadi colwidth piksel pada sel', async () => {
		const table = `<w:tbl>
			<w:tblGrid><w:gridCol w:w="300"/><w:gridCol w:w="600"/></w:tblGrid>
			<w:tr><w:tc>${p(r('A'))}</w:tc><w:tc>${p(r('B'))}</w:tc></w:tr>
		</w:tbl>`
		const row = blocks((await readDocx(docx({ body: table }))).content)[0]?.content?.[0]

		expect(row?.content?.[0]?.attrs?.colwidth).toEqual([20])
		expect(row?.content?.[1]?.attrs?.colwidth).toEqual([40])
	})

	test('sel gridSpan menerima irisan colwidth sesuai bentangannya', async () => {
		const table = `<w:tbl>
			<w:tblGrid><w:gridCol w:w="100"/><w:gridCol w:w="200"/><w:gridCol w:w="300"/></w:tblGrid>
			<w:tr>
				<w:tc><w:tcPr><w:gridSpan w:val="2"/></w:tcPr>${p(r('lebar'))}</w:tc>
				<w:tc>${p(r('biasa'))}</w:tc>
			</w:tr>
		</w:tbl>`
		const row = blocks((await readDocx(docx({ body: table }))).content)[0]?.content?.[0]

		expect(row?.content?.[0]?.attrs?.colwidth).toEqual([7, 13])
		expect(row?.content?.[1]?.attrs?.colwidth).toEqual([20])
	})

	test('tabel tanpa tblGrid tidak mendapat colwidth', async () => {
		const table = `<w:tbl><w:tr><w:tc>${p(r('A'))}</w:tc><w:tc>${p(r('B'))}</w:tc></w:tr></w:tbl>`
		const row = blocks((await readDocx(docx({ body: table }))).content)[0]?.content?.[0]

		expect(row?.content?.[0]?.attrs?.colwidth).toBeUndefined()
		expect(row?.content?.[1]?.attrs?.colwidth).toBeUndefined()
	})

	test('tblGridChange bersarang di dalam tblGrid diabaikan', async () => {
		const table = `<w:tbl>
			<w:tblGrid>
				<w:gridCol w:w="150"/>
				<w:tblGridChange w:id="1"><w:tblGrid><w:gridCol w:w="900"/></w:tblGrid></w:tblGridChange>
			</w:tblGrid>
			<w:tr><w:tc>${p(r('A'))}</w:tc></w:tr>
		</w:tbl>`
		const row = blocks((await readDocx(docx({ body: table }))).content)[0]?.content?.[0]

		expect(row?.content?.[0]?.attrs?.colwidth).toEqual([10])
	})

	test('tanpa tblGrid, lebar tcW dxa menjadi cadangan colwidth', async () => {
		const table = `<w:tbl><w:tr>
			<w:tc><w:tcPr><w:tcW w:w="600" w:type="dxa"/><w:gridSpan w:val="2"/></w:tcPr>${p(r('lebar'))}</w:tc>
			<w:tc><w:tcPr><w:tcW w:w="450" w:type="dxa"/></w:tcPr>${p(r('biasa'))}</w:tc>
		</w:tr></w:tbl>`
		const row = blocks((await readDocx(docx({ body: table }))).content)[0]?.content?.[0]

		expect(row?.content?.[0]?.attrs?.colwidth).toEqual([20, 20])
		expect(row?.content?.[1]?.attrs?.colwidth).toEqual([30])
	})

	test('vMerge restart dan continue menjadi rowspan, sel lanjutan lenyap', async () => {
		const table = `<w:tbl>
			<w:tr><w:tc><w:tcPr><w:vMerge w:val="restart"/></w:tcPr>${p(r('atas'))}</w:tc><w:tc>${p(r('B1'))}</w:tc></w:tr>
			<w:tr><w:tc><w:tcPr><w:vMerge/></w:tcPr></w:tc><w:tc>${p(r('B2'))}</w:tc></w:tr>
		</w:tbl>`
		const tableNode = blocks((await readDocx(docx({ body: table }))).content)[0]
		const rows = tableNode?.content ?? []

		expect(rows).toHaveLength(2)
		expect(rows[0]?.content?.[0]?.attrs?.rowspan).toBe(2)
		// Baris kedua hanya menyisakan sel yang bukan lanjutan penggabungan.
		expect(rows[1]?.content?.map((cell) => textOf(cell))).toEqual(['B2'])
	})

	test('baris yang seluruhnya lanjutan vMerge tidak jadi baris kosong', async () => {
		const table = `<w:tbl>
			<w:tr><w:tc><w:tcPr><w:vMerge w:val="restart"/></w:tcPr>${p(r('tinggi'))}</w:tc></w:tr>
			<w:tr><w:tc><w:tcPr><w:vMerge/></w:tcPr></w:tc></w:tr>
		</w:tbl>`
		const tableNode = blocks((await readDocx(docx({ body: table }))).content)[0]

		expect(tableNode?.content).toHaveLength(1)
		expect(tableNode?.content?.[0]?.content?.[0]?.attrs?.rowspan).toBe(2)
	})

	test('vMerge continue tanpa restart tetap terbawa sebagai sel biasa', async () => {
		const table = `<w:tbl><w:tr><w:tc><w:tcPr><w:vMerge/></w:tcPr>${p(r('yatim'))}</w:tc></w:tr></w:tbl>`
		const row = blocks((await readDocx(docx({ body: table }))).content)[0]?.content?.[0]

		expect(row?.content).toHaveLength(1)
		expect(textOf(row?.content?.[0])).toBe('yatim')
		expect(row?.content?.[0]?.attrs?.rowspan).toBeUndefined()
	})

	test('putar-balik pemformatan tabel: ekspor → impor', async () => {
		const { exportDocx } = await import('../export-docx')
		const { buildSchema } = await import('@/features/sync/serialize')
		const { DEFAULT_PAGE_SETUP, pageGeometry } = await import('@/features/editor/page-geometry')

		const doc = buildSchema().nodeFromJSON({
			type: 'doc',
			content: [
				{
					type: 'table',
					attrs: {
						tableWidth: 300,
						indentLeft: 48,
						borderColor: '#ff0000',
						borderWidth: 2,
						borderStyle: 'dashed',
					},
					content: [
						{
							type: 'tableRow',
							attrs: { rowHeight: 40, cantSplit: true },
							content: [
								{
									type: 'tableHeader',
									attrs: {
										backgroundColor: '#d9e2f3',
										verticalAlign: 'middle',
										cellPadding: '4px 6px 4px 6px',
										borderColor: '#00ff00',
										borderWidth: 1,
										borderStyle: 'solid',
										colwidth: [150],
									},
									content: [
										{
											type: 'paragraph',
											attrs: { lineHeight: '1.73', spaceBefore: 8, spaceAfter: 8 },
											content: [{ type: 'text', text: 'kepala' }],
										},
									],
								},
								{
									type: 'tableHeader',
									attrs: { colwidth: [150] },
									content: [{ type: 'paragraph' }],
								},
							],
						},
					],
				},
			],
		})
		const blob = await exportDocx(doc, {
			title: 'uji',
			geometry: pageGeometry(DEFAULT_PAGE_SETUP),
			setup: DEFAULT_PAGE_SETUP,
		})
		const result = await readDocx(new Uint8Array(await blob.arrayBuffer()))
		const table = blocks(result.content)[0]

		expect(table?.attrs?.tableWidth).toBe(300)
		expect(table?.attrs?.indentLeft).toBe(48)
		expect(table?.attrs?.borderColor).toBe('#ff0000')
		expect(table?.attrs?.borderWidth).toBe(2)
		expect(table?.attrs?.borderStyle).toBe('dashed')

		const row = table?.content?.[0]
		expect(row?.attrs?.rowHeight).toBe(40)
		expect(row?.attrs?.cantSplit).toBe(true)

		const cell = row?.content?.[0]
		expect(cell?.type).toBe('tableHeader')
		expect(cell?.attrs?.backgroundColor).toBe('#d9e2f3')
		expect(cell?.attrs?.verticalAlign).toBe('middle')
		expect(cell?.attrs?.cellPadding).toBe('4px 6px 4px 6px')
		expect(cell?.attrs?.borderColor).toBe('#00ff00')
		expect(cell?.attrs?.borderWidth).toBe(1)

		const paragraph = cell?.content?.[0]
		expect(paragraph?.attrs?.spaceBefore).toBe(8)
		expect(paragraph?.attrs?.spaceAfter).toBe(8)
		expect(paragraph?.attrs?.lineHeight).toBe('1.73')
	})
})

describe('gambar', () => {
	const PNG_1x1 = Uint8Array.from([
		0x89,
		0x50,
		0x4e,
		0x47,
		0x0d,
		0x0a,
		0x1a,
		0x0a, // tanda tangan
		0x00,
		0x00,
		0x00,
		0x0d,
		0x49,
		0x48,
		0x44,
		0x52, // IHDR
		0x00,
		0x00,
		0x00,
		0x01,
		0x00,
		0x00,
		0x00,
		0x01, // lebar=1, tinggi=1
		0x08,
		0x06,
		0x00,
		0x00,
		0x00,
		0x1f,
		0x15,
		0xc4,
		0x89,
		0x00,
		0x00,
		0x00,
		0x0d,
		0x49,
		0x44,
		0x41,
		0x54,
		0x78,
		0x9c,
		0x63,
		0x00,
		0x01,
		0x00,
		0x00,
		0x05,
		0x00,
		0x01,
		0x0d,
		0x0a,
		0x2d,
		0xb4,
		0x00,
		0x00,
		0x00,
		0x00,
		0x49,
		0x45,
		0x4e,
		0x44,
		0xae,
		0x42,
		0x60,
		0x82,
	])
	function drawing(embedId: string, name = 'gambar', cx = 9525, cy = 9525): string {
		return `<w:drawing><wp:inline xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing">
			<wp:extent cx="${cx}" cy="${cy}"/>
			<wp:docPr id="1" name="${name}"/>
			<a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">
			<pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="2" name="${name}"/><pic:cNvPicPr/></pic:nvPicPr>
			<pic:blipFill><a:blip r:embed="${embedId}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>
			<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic>
			</a:graphicData></a:graphic></wp:inline></w:drawing>`
	}

	test('gambar inline jadi node image dengan data URL', async () => {
		const rels = `<Relationship Id="rIdImg" Type="${REL_NS}/image" Target="media/gambar1.png"/>`
		const run = `<w:r>${drawing('rIdImg')}</w:r>`
		const result = await readDocx(docx({ body: p(run), rels, media: { 'media/gambar1.png': PNG_1x1 } }))

		const block = blocks(result.content)[0]
		expect(block?.type).toBe('image')
		expect(String(block?.attrs?.src)).toMatch(/^data:image\/png;base64,/)
		expect(block?.attrs?.alt).toBe('gambar')
	})
	test('ukuran dari extent EMU jadi piksel', async () => {
		const rels = `<Relationship Id="rIdImg" Type="${REL_NS}/image" Target="media/gambar1.png"/>`
		const run = `<w:r>${drawing('rIdImg', 'g', 19050, 9525)}</w:r>`
		const result = await readDocx(docx({ body: p(run), rels, media: { 'media/gambar1.png': PNG_1x1 } }))

		const block = blocks(result.content)[0]
		expect(block?.attrs?.width).toBe(2)
		expect(block?.attrs?.height).toBe(1)
	})

	test('paragraf yang berisi hanya gambar tidak menyisakan paragraf kosong', async () => {
		const rels = `<Relationship Id="rIdImg" Type="${REL_NS}/image" Target="media/gambar1.png"/>`
		const run = `<w:r>${drawing('rIdImg')}</w:r>`
		const result = await readDocx(docx({ body: p(run), rels, media: { 'media/gambar1.png': PNG_1x1 } }))

		expect(blocks(result.content).map((block) => block.type)).toEqual(['image'])
	})
	test('gambar tanpa media ditangani tanpa gagal', async () => {
		const run = `<w:r>${drawing('rIdHilang')}</w:r>`
		const result = await readDocx(docx({ body: p(r('teks') + run) }))
		expect(blocks(result.content)[0]?.type).toBe('paragraph')
	})
})

describe('perataan dan indentasi', () => {
	test('rata kanan-kiri Word jadi justify', async () => {
		const result = await readDocx(docx({ body: p(r('isi'), '<w:jc w:val="both"/>') }))
		expect(blocks(result.content)[0]?.attrs?.textAlign).toBe('justify')
	})

	test('indentasi twip jadi piksel', async () => {
		const result = await readDocx(docx({ body: p(r('isi'), '<w:ind w:left="720"/>') }))
		expect(blocks(result.content)[0]?.attrs?.indentLeft).toBe(48)
	})

	test('hanging jadi indentasi baris pertama yang negatif', async () => {
		const result = await readDocx(docx({ body: p(r('isi'), '<w:ind w:left="720" w:hanging="360"/>') }))
		const attrs = blocks(result.content)[0]?.attrs

		expect(attrs?.indentLeft).toBe(48)
		expect(attrs?.indentFirstLine).toBe(-24)
	})
	test('gaya yang hanya menyebut left tidak menghapus hanging warisan', async () => {
		const styles = `
			<w:docDefaults><w:pPrDefault><w:pPr><w:ind w:left="567" w:hanging="567"/></w:pPr></w:pPrDefault></w:docDefaults>
			<w:style w:type="paragraph" w:styleId="Daftar"><w:name w:val="Daftar"/><w:pPr><w:ind w:left="720"/></w:pPr></w:style>`
		const result = await readDocx(docx({ styles, body: p(r('isi'), '<w:pStyle w:val="Daftar"/>') }))
		const attrs = blocks(result.content)[0]?.attrs

		expect(attrs?.indentLeft).toBe(48)
		expect(attrs?.indentFirstLine).toBe(-38)
	})
})

describe('spasi', () => {
	test('spasi 1,5 Word lebih longgar dari 1,5 CSS', async () => {
		const result = await readDocx(docx({ body: p(r('isi'), '<w:spacing w:line="360" w:lineRule="auto"/>') }))
		expect(blocks(result.content)[0]?.attrs?.lineHeight).toBe('1.73')
	})

	test('spasi tunggal jadi normal, bukan angka', async () => {
		const result = await readDocx(docx({ body: p(r('isi'), '<w:spacing w:line="240" w:lineRule="auto"/>') }))
		expect(blocks(result.content)[0]?.attrs?.lineHeight).toBe('normal')
	})

	test('spasi pasti dinyatakan dalam piksel', async () => {
		const result = await readDocx(docx({ body: p(r('isi'), '<w:spacing w:line="360" w:lineRule="exact"/>') }))
		expect(blocks(result.content)[0]?.attrs?.lineHeight).toBe('24px')
	})
	test('paragraf tanpa keterangan spasi tetap dinyatakan rapat', async () => {
		const attrs = blocks((await readDocx(docx({ body: p(r('isi')) }))).content)[0]?.attrs

		expect(attrs?.lineHeight).toBe('normal')
		expect(attrs?.spaceBefore).toBe(0)
		expect(attrs?.spaceAfter).toBe(0)
	})

	test('jarak otomatis tidak dibaca sebagai angka yang tersimpan di sebelahnya', async () => {
		const result = await readDocx(
			docx({ body: p(r('isi'), '<w:spacing w:before="100" w:beforeAutospacing="1"/>') }),
		)
		expect(blocks(result.content)[0]?.attrs?.spaceBefore).toBe(0)
	})
})

describe('rupa huruf', () => {
	const textStyle = (block: JSONContent | undefined) =>
		block?.content?.[0]?.marks?.find((mark) => mark.type === 'textStyle')?.attrs

	test('ukuran setengah poin jadi poin', async () => {
		const result = await readDocx(docx({ body: p(r('isi', '<w:sz w:val="24"/>')) }))
		expect(textStyle(blocks(result.content)[0])?.fontSize).toBe('12pt')
	})

	test('nama font dibawa beserta cadangan generiknya', async () => {
		const result = await readDocx(docx({ body: p(r('isi', '<w:rFonts w:ascii="Times New Roman"/>')) }))
		expect(textStyle(blocks(result.content)[0])?.fontFamily).toBe('"Times New Roman", serif')
	})
	test('font yang kita muat sendiri dipetakan ke variabelnya', async () => {
		const result = await readDocx(docx({ body: p(r('isi', '<w:rFonts w:ascii="Lora"/>')) }))
		expect(textStyle(blocks(result.content)[0])?.fontFamily).toBe('var(--font-lora), serif')
	})

	test('rujukan font tema diselesaikan lewat theme1.xml', async () => {
		const result = await readDocx(
			docx({
				theme: { major: 'Calibri Light', minor: 'Calibri' },
				body: p(r('isi', '<w:rFonts w:asciiTheme="minorHAnsi"/>')),
			}),
		)
		expect(textStyle(blocks(result.content)[0])?.fontFamily).toBe('Calibri, sans-serif')
	})
	test('font bernama menang atas rujukan tema yang diwarisi', async () => {
		const styles = `
			<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:asciiTheme="minorHAnsi"/></w:rPr></w:rPrDefault></w:docDefaults>
			<w:style w:type="paragraph" w:default="1" w:styleId="Normal">
				<w:name w:val="Normal"/><w:rPr><w:rFonts w:ascii="Times New Roman"/></w:rPr>
			</w:style>`
		const result = await readDocx(
			docx({ styles, theme: { major: 'Calibri Light', minor: 'Calibri' }, body: p(r('isi')) }),
		)
		expect(textStyle(blocks(result.content)[0])?.fontFamily).toBe('"Times New Roman", serif')
	})
	test('gaya bawaan berlaku pada paragraf yang tidak menyebut gayanya', async () => {
		const styles = `<w:style w:type="paragraph" w:default="1" w:styleId="Normal">
			<w:name w:val="Normal"/><w:rPr><w:sz w:val="28"/></w:rPr></w:style>`
		const result = await readDocx(docx({ styles, body: p(r('isi')) }))
		expect(textStyle(blocks(result.content)[0])?.fontSize).toBe('14pt')
	})

	test('warna heksa dibawa, warna otomatis tidak', async () => {
		const berwarna = await readDocx(docx({ body: p(r('isi', '<w:color w:val="FF0000"/>')) }))
		const otomatis = await readDocx(docx({ body: p(r('isi', '<w:color w:val="auto"/>')) }))

		expect(textStyle(blocks(berwarna.content)[0])?.color).toBe('#ff0000')
		expect(textStyle(blocks(otomatis.content)[0])?.color).toBeUndefined()
	})

	test('sorotan bernama jadi warna', async () => {
		const result = await readDocx(docx({ body: p(r('isi', '<w:highlight w:val="yellow"/>')) }))
		expect(markNamed(blocks(result.content)[0], 'highlight')?.attrs?.color).toBe('#ffff00')
	})
	test('teks yang tidak tebal menyatakan bobotnya', async () => {
		const result = await readDocx(docx({ body: p(r('judul tipis')) }))
		expect(textStyle(blocks(result.content)[0])?.fontWeight).toBe('normal')
	})

	test('teks tebal tidak menyatakan bobot yang membantah tandanya', async () => {
		const result = await readDocx(docx({ body: p(r('tegas', '<w:b/>')) }))
		expect(textStyle(blocks(result.content)[0])?.fontWeight).toBeUndefined()
	})
})

describe('penomoran otomatis', () => {
	const BERTINGKAT = `
		<w:abstractNum w:abstractNumId="0">
			<w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="upperRoman"/><w:lvlText w:val="BAB %1"/></w:lvl>
			<w:lvl w:ilvl="1"><w:start w:val="1"/><w:numFmt w:val="decimal"/><w:lvlText w:val="%1.%2"/></w:lvl>
			<w:lvl w:ilvl="2"><w:start w:val="1"/><w:numFmt w:val="decimal"/><w:lvlText w:val="%1.%2.%3"/></w:lvl>
		</w:abstractNum>
		<w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num>`

	const numbered = (ilvl: number, numId = 1) =>
		`<w:numPr><w:ilvl w:val="${ilvl}"/><w:numId w:val="${numId}"/></w:numPr>`
	test('nomor otomatis dibakar sebagai teks di awal paragraf', async () => {
		const result = await readDocx(
			docx({ numbering: BERTINGKAT, body: p(r('Pendahuluan'), `${numbered(0)}<w:outlineLvl w:val="0"/>`) }),
		)
		expect(textOf(blocks(result.content)[0])).toBe('BAB I Pendahuluan')
	})

	test('deret bertingkat menghitung tiap tingkat lalu dibakar', async () => {
		const heading = (text: string, ilvl: number) =>
			p(r(text), `${numbered(ilvl)}<w:outlineLvl w:val="${ilvl}"/>`)
		const body = heading('Satu', 0) + heading('a', 1) + heading('Dua', 0)
		const result = await readDocx(docx({ numbering: BERTINGKAT, body }))

		expect(blocks(result.content).map((block) => textOf(block))).toEqual([
			'BAB I Satu',
			'I.1 a',
			'BAB II Dua',
		])
	})
	test('numId nol tidak menyisipkan nomor', async () => {
		const styles = `<w:style w:type="paragraph" w:styleId="Bab">
			<w:name w:val="Bab"/><w:pPr>${numbered(0)}<w:outlineLvl w:val="0"/></w:pPr></w:style>
			<w:style w:type="paragraph" w:styleId="BabTanpaNomor">
			<w:name w:val="Bab tanpa nomor"/><w:basedOn w:val="Bab"/>
			<w:pPr><w:numPr><w:numId w:val="0"/></w:numPr></w:pPr></w:style>`
		const body =
			p(r('Bernomor'), '<w:pStyle w:val="Bab"/>') +
			p(r('Daftar Pustaka'), '<w:pStyle w:val="BabTanpaNomor"/>')
		const result = await readDocx(docx({ numbering: BERTINGKAT, styles, body }))

		expect(blocks(result.content).map((block) => textOf(block))).toEqual(['BAB I Bernomor', 'Daftar Pustaka'])
	})
	test('nomor tebal dibakar sebagai run bertanda tebal', async () => {
		const body = p(r('isi'), `${numbered(0)}<w:rPr><w:b/></w:rPr><w:outlineLvl w:val="0"/>`)
		const block = blocks((await readDocx(docx({ numbering: BERTINGKAT, body }))).content)[0]
		expect(marksOf(block, 0)).toContain('bold')
	})

	test('dokumen tanpa bagian penomoran tetap terbaca', async () => {
		const result = await readDocx(docx({ body: p(r('isi'), numbered(0)) }))
		expect(textOf(blocks(result.content)[0])).toBe('isi')
	})
})

describe('paragraf numPr jadi list asli', () => {
	const LIST = `
		<w:abstractNum w:abstractNumId="0">
			<w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="decimal"/><w:lvlText w:val="%1."/></w:lvl>
			<w:lvl w:ilvl="1"><w:start w:val="1"/><w:numFmt w:val="decimal"/><w:lvlText w:val="%2."/></w:lvl>
		</w:abstractNum>
		<w:abstractNum w:abstractNumId="1">
			<w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="bullet"/><w:lvlText w:val="•"/></w:lvl>
		</w:abstractNum>
		<w:abstractNum w:abstractNumId="2">
			<w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="lowerLetter"/><w:lvlText w:val="%1."/></w:lvl>
		</w:abstractNum>
		<w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num>
		<w:num w:numId="2"><w:abstractNumId w:val="1"/></w:num>
		<w:num w:numId="3"><w:abstractNumId w:val="2"/></w:num>`

	const numItem = (text: string, numId: number, ilvl = 0, left?: number) =>
		p(
			r(text),
			`<w:numPr><w:ilvl w:val="${ilvl}"/><w:numId w:val="${numId}"/></w:numPr>` +
				(left !== undefined ? `<w:ind w:left="${left}"/>` : ''),
		)

	test('paragraf numPr berurutan jadi satu orderedList, nomor tidak dibakar jadi teks', async () => {
		const body = numItem('satu', 1) + numItem('dua', 1) + numItem('tiga', 1)
		const result = await readDocx(docx({ numbering: LIST, body }))
		const content = blocks(result.content)

		expect(content).toHaveLength(1)
		const list = content[0]
		expect(list?.type).toBe('orderedList')
		expect(list?.attrs?.start).toBeUndefined()
		expect(list?.content?.map((node) => node.type)).toEqual(['listItem', 'listItem', 'listItem'])
		expect(textOf(list?.content?.[0])).toBe('satu')
		expect(textOf(list)).toBe('satuduatiga')
	})

	test('format bullet jadi bulletList', async () => {
		const result = await readDocx(docx({ numbering: LIST, body: numItem('a', 2) + numItem('b', 2) }))
		const list = blocks(result.content)[0]

		expect(list?.type).toBe('bulletList')
		expect(list?.content).toHaveLength(2)
	})

	test('format lowerLetter jadi orderedList dengan type "a"', async () => {
		const result = await readDocx(docx({ numbering: LIST, body: numItem('a', 3) + numItem('b', 3) }))
		const list = blocks(result.content)[0]

		expect(list?.type).toBe('orderedList')
		expect(list?.attrs?.type).toBe('a')
	})

	test('numId sama dengan ilvl lebih dalam jadi list anak di dalam item', async () => {
		const result = await readDocx(
			docx({ numbering: LIST, body: numItem('induk', 1, 0) + numItem('anak', 1, 1) }),
		)
		const list = blocks(result.content)[0]

		expect(list?.type).toBe('orderedList')
		expect(list?.content).toHaveLength(1)
		const item = list?.content?.[0]
		const child = item?.content?.find((node) => node.type === 'orderedList')
		expect(child).toBeDefined()
		expect(child?.content).toHaveLength(1)
		expect(textOf(child)).toBe('anak')
	})

	test('numId berbeda dengan indentasi lebih dalam jadi list anak (pola SWOT)', async () => {
		const body =
			numItem('Strengths', 1, 0, 360) +
			numItem('keunggulan satu', 3, 0, 630) +
			numItem('Weaknesses', 1, 0, 360) +
			numItem('kekurangan satu', 3, 0, 630)
		const result = await readDocx(docx({ numbering: LIST, body }))
		const list = blocks(result.content)[0]

		expect(list?.type).toBe('orderedList')
		expect(list?.content).toHaveLength(2)
		const first = list?.content?.[0]?.content?.find((node) => node.type === 'orderedList')
		expect(first?.attrs?.type).toBe('a')
		expect(textOf(first)).toBe('keunggulan satu')
		const second = list?.content?.[1]?.content?.find((node) => node.type === 'orderedList')
		expect(textOf(second)).toBe('kekurangan satu')
	})

	test('paragraf keterangan menjorok di antara item ikut item terbuka, bukan menutup list', async () => {
		const body =
			numItem('Strengths', 1, 0, 360) +
			p(r('Keterangan strengths.'), '<w:ind w:left="360"/>') +
			numItem('keunggulan satu', 3, 0, 630) +
			numItem('Weaknesses', 1, 0, 360)
		const result = await readDocx(docx({ numbering: LIST, body }))
		const content = blocks(result.content)

		expect(content).toHaveLength(1)
		const list = content[0]
		expect(list?.type).toBe('orderedList')
		expect(list?.content).toHaveLength(2)
		const item = list?.content?.[0]
		expect(item?.content?.map((node) => node.type)).toEqual(['paragraph', 'paragraph', 'orderedList'])
		expect(textOf(item?.content?.[1])).toBe('Keterangan strengths.')
	})

	test('numId dan ilvl sama tetap satu list walau indentasi berubah', async () => {
		const result = await readDocx(
			docx({ numbering: LIST, body: numItem('satu', 1, 0, 270) + numItem('dua', 1, 0, 360) }),
		)
		const content = blocks(result.content)

		expect(content).toHaveLength(1)
		expect(content[0]?.type).toBe('orderedList')
		expect(content[0]?.content).toHaveLength(2)
	})

	test('list yang terputus paragraf lanjut dengan start meneruskan hitungan', async () => {
		const body =
			numItem('satu', 1) + numItem('dua', 1) + p(r('jeda')) + numItem('tiga', 1) + numItem('empat', 1)
		const result = await readDocx(docx({ numbering: LIST, body }))
		const content = blocks(result.content)

		expect(content.map((block) => block.type)).toEqual(['orderedList', 'paragraph', 'orderedList'])
		expect(content[0]?.content).toHaveLength(2)
		expect(content[2]?.attrs?.start).toBe(3)
		expect(content[2]?.content).toHaveLength(2)
	})

	test('numId nol tidak menjadi list dan tidak menyisipkan nomor', async () => {
		const result = await readDocx(docx({ numbering: LIST, body: numItem('biasa', 0) }))
		const block = blocks(result.content)[0]

		expect(block?.type).toBe('paragraph')
		expect(textOf(block)).toBe('biasa')
	})

	test('heading bernomor tetap membakar nomornya sebagai teks', async () => {
		const body = p(
			r('Pendahuluan'),
			'<w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr><w:outlineLvl w:val="0"/>',
		)
		const result = await readDocx(docx({ numbering: LIST, body }))
		const block = blocks(result.content)[0]

		expect(block?.type).toBe('heading')
		expect(textOf(block)).toBe('1. Pendahuluan')
	})
})

describe('berkas yang tidak wajar', () => {
	test('berkas yang bukan zip ditolak dengan alasan yang jelas', async () => {
		expect(readDocx(strToU8('ini bukan docx'))).rejects.toThrow(/bukan DOCX/i)
	})

	test('dokumen tanpa isi tetap menghasilkan satu paragraf', async () => {
		const result = await readDocx(docx({ body: '' }))
		expect(blocks(result.content)).toEqual([{ type: 'paragraph' }])
	})
})

describe('impor section (E4)', () => {
	const sectPr = (inner: string) => `<w:sectPr>${inner}</w:sectPr>`
	const pgSz = (w: number, h: number, orient = '') =>
		`<w:pgSz w:w="${w}" w:h="${h}"${orient ? ` w:orient="${orient}"` : ''}/>`
	const pgMar = (twips = 1440) =>
		`<w:pgMar w:top="${twips}" w:right="${twips}" w:bottom="${twips}" w:left="${twips}"/>`
	const sectionBreaksOf = (document: JSONContent) =>
		blocks(document).filter((block) => block.type === 'sectionBreak')

	test('satu section: sectPr badan jadi tata letak naskah, bukan pembatas', async () => {
		const result = await readDocx(docx({ body: p(r('isi')) + sectPr(pgSz(11906, 16838) + pgMar()) }))

		expect(result.pageSetup?.size).toBe('a4')
		expect(result.pageSetup?.orientation).toBe('portrait')
		expect(result.pageSetup?.margins).toEqual({ top: 96, right: 96, bottom: 96, left: 96 })
		expect(sectionBreaksOf(result.content)).toHaveLength(0)
	})

	test('kertas standar pulang dengan namanya, bukan ukuran khusus', async () => {
		const letter = await readDocx(docx({ body: sectPr(pgSz(12240, 15840)) }))
		expect(letter.pageSetup?.size).toBe('letter')
	})

	test('lanskap bentuk Word: sisi sudah tertukar + w:orient', async () => {
		const result = await readDocx(docx({ body: sectPr(pgSz(16838, 11906, 'landscape')) }))
		expect(result.pageSetup?.size).toBe('a4')
		expect(result.pageSetup?.orientation).toBe('landscape')
	})

	test('lanskap bentuk pustaka docx: sisi tegak + w:orient', async () => {
		const result = await readDocx(docx({ body: sectPr(pgSz(11906, 16838, 'landscape')) }))
		expect(result.pageSetup?.size).toBe('a4')
		expect(result.pageSetup?.orientation).toBe('landscape')
	})

	test('ukuran yang benar-benar asing jadi ukuran khusus yang jujur', async () => {
		const result = await readDocx(docx({ body: sectPr(pgSz(9000, 12000)) }))
		expect(result.pageSetup?.size).toBe('custom')
		expect(result.pageSetup?.customWidth).toBe(600)
		expect(result.pageSetup?.customHeight).toBe(800)
	})

	test('dua section: pembatas dibawa sectPr KEDUA, yang pertama milik naskah', async () => {
		const body =
			p(r('satu'), sectPr(pgSz(12240, 15840) + pgMar())) + p(r('dua')) + sectPr(pgSz(11906, 16838) + pgMar())
		const result = await readDocx(docx({ body }))

		expect(result.pageSetup?.size).toBe('letter')
		expect(blocks(result.content).map((block) => block.type)).toEqual([
			'paragraph',
			'sectionBreak',
			'paragraph',
		])
		const pembatas = sectionBreaksOf(result.content)[0]
		expect(pembatas?.attrs?.pageSetup.size).toBe('a4')
		expect(pembatas?.attrs?.pageSetup.orientation).toBe('portrait')
		expect(pembatas?.attrs?.columns).toBeNull()
	})

	test('kolom section ikut ke pembatasnya', async () => {
		const body =
			p(r('satu'), sectPr(pgSz(11906, 16838))) +
			p(r('dua')) +
			sectPr(`${pgSz(11906, 16838)}<w:cols w:num="2" w:space="708"/>`)
		const result = await readDocx(docx({ body }))

		expect(sectionBreaksOf(result.content)[0]?.attrs?.columns).toEqual({ count: 2, gap: 47 })
	})

	test('kolom di section pertama dibawa pembatas menerus di awal dokumen', async () => {
		const result = await readDocx(
			docx({ body: p(r('isi')) + sectPr(`${pgSz(11906, 16838)}<w:cols w:num="2"/>`) }),
		)
		const blocks_ = blocks(result.content)
		expect(blocks_[0]?.type).toBe('sectionBreak')
		expect(blocks_[0]?.attrs?.columns).toEqual({ count: 2 })
		expect(blocks_[0]?.attrs?.continuous).toBe(true)
		expect(result.warnings.map((warning) => warning.message).join('\n')).not.toContain('kolom')
	})

	test('pembatas tetap dibuat walau kedua section ber setelan sama', async () => {
		const body = p(r('satu'), sectPr(pgSz(11906, 16838))) + p(r('dua')) + sectPr(pgSz(11906, 16838))
		const result = await readDocx(docx({ body }))
		expect(sectionBreaksOf(result.content)).toHaveLength(1)
	})

	test('ekspor → impor mengembalikan section yang sama', async () => {
		const { exportDocx } = await import('../export-docx')
		const { buildSchema } = await import('@/features/sync/serialize')
		const { DEFAULT_PAGE_SETUP, pageGeometry } = await import('@/features/editor/page-geometry')

		const doc = buildSchema().nodeFromJSON({
			type: 'doc',
			content: [
				{ type: 'paragraph', content: [{ type: 'text', text: 'potret' }] },
				{
					type: 'sectionBreak',
					attrs: {
						pageSetup: { size: 'letter', orientation: 'landscape' },
						columns: { count: 2 },
					},
				},
				{ type: 'paragraph', content: [{ type: 'text', text: 'lanskap' }] },
			],
		})
		const blob = await exportDocx(doc, {
			title: 'uji',
			geometry: pageGeometry(DEFAULT_PAGE_SETUP),
			setup: DEFAULT_PAGE_SETUP,
		})
		const result = await readDocx(new Uint8Array(await blob.arrayBuffer()))

		expect(result.pageSetup?.size).toBe('a4')
		const pembatas = sectionBreaksOf(result.content)
		expect(pembatas).toHaveLength(1)
		expect(pembatas[0]?.attrs?.pageSetup.size).toBe('letter')
		expect(pembatas[0]?.attrs?.pageSetup.orientation).toBe('landscape')
		expect(pembatas[0]?.attrs?.columns.count).toBe(2)
	})

	test('sectPr continuous dengan geometri sama terbaca sebagai pembatas menerus (E5)', async () => {
		const body =
			p(r('satu'), sectPr(pgSz(11906, 16838))) +
			p(r('dua')) +
			sectPr(`${pgSz(11906, 16838)}<w:type w:val="continuous"/>`)
		const result = await readDocx(docx({ body }))

		expect(sectionBreaksOf(result.content)[0]?.attrs?.continuous).toBe(true)
	})

	test('sectPr continuous yang mengubah ukuran turun pangkat jadi pembatas biasa (E5)', async () => {
		const body =
			p(r('satu'), sectPr(pgSz(11906, 16838))) +
			p(r('dua')) +
			sectPr(`${pgSz(12240, 15840)}<w:type w:val="continuous"/>`)
		const result = await readDocx(docx({ body }))

		const pembatas = sectionBreaksOf(result.content)[0]
		expect(pembatas?.attrs?.continuous).toBeFalsy()
		expect(pembatas?.attrs?.pageSetup.size).toBe('letter')
	})

	test('putar-balik pembatas menerus: ekspor → impor (E5)', async () => {
		const { exportDocx } = await import('../export-docx')
		const { buildSchema } = await import('@/features/sync/serialize')
		const { DEFAULT_PAGE_SETUP, pageGeometry } = await import('@/features/editor/page-geometry')

		const doc = buildSchema().nodeFromJSON({
			type: 'doc',
			content: [
				{ type: 'paragraph', content: [{ type: 'text', text: 'satu' }] },
				{ type: 'sectionBreak', attrs: { pageSetup: null, columns: { count: 2 }, continuous: true } },
				{ type: 'paragraph', content: [{ type: 'text', text: 'dua' }] },
				{ type: 'sectionBreak', attrs: { pageSetup: null, columns: null, continuous: true } },
				{ type: 'paragraph', content: [{ type: 'text', text: 'tiga' }] },
			],
		})
		const blob = await exportDocx(doc, {
			title: 'uji',
			geometry: pageGeometry(DEFAULT_PAGE_SETUP),
			setup: DEFAULT_PAGE_SETUP,
		})
		const result = await readDocx(new Uint8Array(await blob.arrayBuffer()))

		const pembatas = sectionBreaksOf(result.content)
		expect(pembatas).toHaveLength(2)
		expect(pembatas[0]?.attrs).toMatchObject({ continuous: true })
		expect(pembatas[0]?.attrs?.columns).toMatchObject({ count: 2 })
		expect(pembatas[1]?.attrs).toMatchObject({ continuous: true, columns: null })
	})
})
describe('rumus matematika (OMML)', () => {
	const mr = (text: string) => `<m:r><m:t>${text}</m:t></m:r>`
	const sub = (base: string, subText: string) =>
		`<m:sSub><m:e>${base}</m:e><m:sub>${subText}</m:sub></m:sSub>`
	const frac = (num: string, den: string) => `<m:f><m:num>${num}</m:num><m:den>${den}</m:den></m:f>`

	function latexOf(node: JSONContent | undefined): string {
		return String(node?.attrs?.latex ?? '')
	}

	test('oMath inline menjadi node mathInline di tengah paragraf', async () => {
		const result = await readDocx(
			docx({ body: p(`${r('nilai ')}<m:oMath>${frac(mr('a'), mr('b'))}</m:oMath>`) }),
		)
		const paragraf = blocks(result.content)[0]
		const isi = paragraf?.content ?? []

		expect(isi.map((node) => node.type)).toEqual(['text', 'mathInline'])
		expect(latexOf(isi[1])).toBe('\\frac{a}{b}')
	})

	test('oMathPara menjadi mathBlock tanpa paragraf kosong tambahan', async () => {
		const result = await readDocx(
			docx({ body: p(`<m:oMathPara><m:oMath>${mr('W=')}${frac(mr('x'), mr('y'))}</m:oMath></m:oMathPara>`) }),
		)

		expect(blocks(result.content)).toHaveLength(1)
		expect(blocks(result.content)[0]?.type).toBe('mathBlock')
		expect(latexOf(blocks(result.content)[0])).toBe('W=\\frac{x}{y}')
	})

	test('teks sebelum oMathPara tetap terbawa sebagai paragraf tersendiri', async () => {
		const result = await readDocx(
			docx({
				body: p(`${r('karena ')}<m:oMathPara><m:oMath>${mr('E')}</m:oMath></m:oMathPara>`),
			}),
		)

		expect(blocks(result.content).map((node) => node.type)).toEqual(['paragraph', 'mathBlock'])
		expect(textOf(blocks(result.content)[0])).toBe('karena ')
	})

	test('penjumlahan nary dengan batas atas bawah', async () => {
		const nary = `<m:nary><m:naryPr><m:chr m:val="∑"/></m:naryPr>
			<m:sub>${mr('i=1')}</m:sub><m:sup>${mr('n')}</m:sup>
			<m:e>${sub(mr('a'), mr('ij'))}</m:e></m:nary>`
		const result = await readDocx(docx({ body: p(`<m:oMathPara><m:oMath>${nary}</m:oMath></m:oMathPara>`) }))

		expect(latexOf(blocks(result.content)[0])).toBe('\\sum_{i=1}^{n}{{a}_{ij}}')
	})

	test('delimeter dengan begChr/endChr kurung siku', async () => {
		const d = `<m:d><m:dPr><m:begChr m:val="["/><m:endChr m:val="]"/></m:dPr><m:e>${mr('x')}</m:e></m:d>`
		const result = await readDocx(docx({ body: p(`<m:oMath>${d}</m:oMath>`) }))

		expect(latexOf(blocks(result.content)[0]?.content?.[0])).toBe('\\left[x\\right]')
	})

	test('akar tanpa derajat menjadi sqrt', async () => {
		const rad = `<m:rad><m:radPr><m:degHide m:val="1"/></m:radPr><m:deg/>
			<m:e><m:sSup><m:e>${mr('x')}</m:e><m:sup>${mr('2')}</m:sup></m:sSup></m:e></m:rad>`
		const result = await readDocx(docx({ body: p(`<m:oMath>${rad}</m:oMath>`) }))

		expect(latexOf(blocks(result.content)[0]?.content?.[0])).toBe('\\sqrt{{x}^{2}}')
	})

	test('matriks memakai environment matrix dengan & dan \\\\', async () => {
		const matrix = `<m:m><m:mr><m:e>${mr('1')}</m:e><m:e>${mr('2')}</m:e></m:mr>
			<m:mr><m:e>${mr('3')}</m:e><m:e>${mr('4')}</m:e></m:mr></m:m>`
		const result = await readDocx(docx({ body: p(`<m:oMath>${matrix}</m:oMath>`) }))

		expect(latexOf(blocks(result.content)[0]?.content?.[0])).toBe(
			'\\begin{matrix}1 & 2 \\\\ 3 & 4\\end{matrix}',
		)
	})

	test('baris persamaan (eqArr) memakai environment gathered', async () => {
		const eqArr = `<m:eqArr><m:e>${mr('a')}</m:e><m:e>${mr('b')}</m:e></m:eqArr>`
		const result = await readDocx(docx({ body: p(`<m:oMathPara><m:oMath>${eqArr}</m:oMath></m:oMathPara>`) }))

		expect(latexOf(blocks(result.content)[0])).toBe('\\begin{gathered}a \\\\ b\\end{gathered}')
	})

	test('frasa multi-kata dibungkus text agar spasinya terjaga', async () => {
		const result = await readDocx(docx({ body: p(`<m:oMath>${mr('Consistency Index ')}</m:oMath>`) }))
		expect(latexOf(blocks(result.content)[0]?.content?.[0])).toBe('\\text{Consistency Index}')
	})

	test('nama fungsi max dan min jadi operator LaTeX', async () => {
		const lambdaMax = sub(mr('λ'), mr('max'))
		const result = await readDocx(docx({ body: p(`<m:oMath>${lambdaMax}</m:oMath>`) }))

		expect(latexOf(blocks(result.content)[0]?.content?.[0])).toBe('{λ}_{\\max }')
	})

	test('nomor persamaan satu paragraf dengan rumus inline', async () => {
		const body = p(`<m:oMath>${frac(mr('a'), mr('b'))}</m:oMath><w:r><w:tab/></w:r>${r('(1)')}`)
		const result = await readDocx(docx({ body }))
		const paragraf = blocks(result.content)[0]

		expect(blocks(result.content)).toHaveLength(1)
		expect(paragraf?.content?.map((node) => node.type)).toEqual(['mathInline', 'text', 'text'])
		expect(textOf(paragraf)).toBe('\t(1)')
	})
})

describe('celah impor — S4/S11/S12 format run', () => {
	test('superscript dan subscript jadi mark', async () => {
		const body =
			p(r('atas', '<w:vertAlign w:val="superscript"/>')) + p(r('bawah', '<w:vertAlign w:val="subscript"/>'))
		const result = await readDocx(docx({ body }))

		expect(marksOf(blocks(result.content)[0])).toContain('superscript')
		expect(marksOf(blocks(result.content)[1])).toContain('subscript')
	})

	test('arsiran run (w:shd) jadi backgroundColor textStyle', async () => {
		const result = await readDocx(docx({ body: p(r('sorot', '<w:shd w:val="clear" w:fill="FFFF00"/>')) }))
		const mark = markNamed(blocks(result.content)[0], 'textStyle')
		expect(mark?.attrs?.backgroundColor).toBe('#ffff00')
	})

	test('teks tersembunyi (w:vanish) tidak ikut tampil', async () => {
		const result = await readDocx(
			docx({ body: p(`${r('tampul')}<w:r><w:rPr><w:vanish/></w:rPr><w:t>rahasia</w:t></w:r>`) }),
		)
		expect(textOf(blocks(result.content)[0])).toBe('tampul')
		// Membuang teks tanpa memberi tahu adalah kelas kehilangan yang sama
		// dengan yang hendak dihapus impor ini.
		expect(result.warnings.map((warning) => warning.message).join('\n')).toContain('teks tersembunyi')
	})

	test('sorotan warna hex kustom terbawa', async () => {
		const result = await readDocx(docx({ body: p(r('aksen', '<w:highlight w:val="FF8800"/>')) }))
		const mark = markNamed(blocks(result.content)[0], 'highlight')
		expect(mark?.attrs?.color).toBe('#ff8800')
	})

	test('glyph w:sym dari font simbol dipetakan ke Unicode', async () => {
		const sym = '<w:r><w:sym w:font="Wingdings" w:char="F0A7"/></w:r>'
		const result = await readDocx(docx({ body: p(sym) }))
		expect(textOf(blocks(result.content)[0])).toBe('▪')
	})
})

describe('celah impor — S1/S2 judul', () => {
	test('outlineLvl 8 jadi heading level 9, tanpa dipangkas ke 6', async () => {
		const result = await readDocx(docx({ body: p(r('caption'), '<w:outlineLvl w:val="8"/>') }))
		expect(blocks(result.content)[0]?.type).toBe('heading')
		expect(blocks(result.content)[0]?.attrs?.level).toBe(9)
	})

	test('nama heading terlokalisasi (제목1, Judul 3) dikenali', async () => {
		const styles = `
			<w:style w:type="paragraph" w:styleId="Ko1"><w:name w:val="제목1"/><w:basedOn w:val="Normal"/></w:style>
			<w:style w:type="paragraph" w:styleId="J3"><w:name w:val="Judul 3"/><w:basedOn w:val="Normal"/></w:style>`
		const body = p(r('judul korea'), '<w:pStyle w:val="Ko1"/>') + p(r('judul indo'), '<w:pStyle w:val="J3"/>')
		const result = await readDocx(docx({ body, styles }))

		expect(blocks(result.content)[0]?.attrs?.level).toBe(1)
		expect(blocks(result.content)[1]?.attrs?.level).toBe(3)
	})

	test('nama style daun menang atas leluhur di rantai basedOn', async () => {
		const styles = `<w:style w:type="paragraph" w:styleId="H1"><w:name w:val="heading 1"/></w:style>
			<w:style w:type="paragraph" w:styleId="Sub"><w:name w:val="Judul 3"/><w:basedOn w:val="H1"/></w:style>`
		const result = await readDocx(docx({ body: p(r('Bagian'), '<w:pStyle w:val="Sub"/>'), styles }))

		const block = blocks(result.content)[0]
		expect(block?.type).toBe('heading')
		expect(block?.attrs?.level).toBe(3)
	})

	test('heuristik nomor: dokumen tanpa kerangka mendapat heading dari polanya', async () => {
		const body =
			p(r('1. PENDAHULUAN')) +
			p(r('isi naskah biasa yang panjang sekali sehingga bukan heading.')) +
			p(r('2.1. Landasan')) +
			p(r('2.2. Metode'))
		const result = await readDocx(docx({ body }))
		const levels = blocks(result.content)
			.filter((block) => block.type === 'heading')
			.map((block) => block.attrs?.level)

		expect(levels).toEqual([1, 2, 2])
	})

	test('heuristik nomor tidak menyentuh dokumen yang punya heading style', async () => {
		const styles =
			'<w:style w:type="paragraph" w:styleId="H1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/></w:style>'
		const body = p(r('Bab Resmi'), '<w:pStyle w:val="H1"/>') + p('1. kalimat bernomor yang bukan judul')
		const result = await readDocx(docx({ body, styles }))

		expect(blocks(result.content).filter((block) => block.type === 'heading')).toHaveLength(1)
		expect(blocks(result.content)[1]?.type).toBe('paragraph')
	})
})

describe('celah impor — tabel (S9/S10/D6)', () => {
	test('w:tblHeader hanya menjadikan baris pertama header', async () => {
		const row = (text: string) => `<w:tr><w:trPr><w:tblHeader/></w:trPr><w:tc>${p(r(text))}</w:tc></w:tr>`
		const table = `<w:tbl>${row('kepala')}${row('isi')}</w:tbl>`
		const result = await readDocx(docx({ body: table }))
		const table_ = blocks(result.content)[0]
		const cellTypes = (table_?.content ?? []).map((row_) => row_?.content?.[0]?.type)

		expect(cellTypes).toEqual(['tableHeader', 'tableCell'])
	})

	test('border dari style tabel dipakai bila tblPr tidak membawanya', async () => {
		const styles = `
			<w:style w:type="table" w:styleId="Grid"><w:name w:val="Table Grid"/>
			<w:tblPr><w:tblBorders>
				<w:top w:val="single" w:sz="4" w:color="0000FF"/>
				<w:left w:val="single" w:sz="4" w:color="0000FF"/>
				<w:bottom w:val="single" w:sz="4" w:color="0000FF"/>
				<w:right w:val="single" w:sz="4" w:color="0000FF"/>
			</w:tblBorders></w:tblPr></w:style>`
		const table = `<w:tbl><w:tblPr><w:tblStyle w:val="Grid"/></w:tblPr><w:tr><w:tc>${p(r('sel'))}</w:tc></w:tr></w:tbl>`
		const result = await readDocx(docx({ body: table, styles }))
		const attrs = blocks(result.content)[0]?.attrs as Record<string, unknown>

		expect(attrs.borderColor).toBe('#0000ff')
		expect(attrs.borderWidth).toBe(1)
	})

	test('tabel bersarang diratakan menjadi paragraf, teksnya selamat', async () => {
		const inner = `<w:tbl><w:tr><w:tc>${p(r('dalam A'))}</w:tc><w:tc>${p(r('dalam B'))}</w:tc></w:tr></w:tbl>`
		const outer = `<w:tbl><w:tr><w:tc>${p(r('luar'))}${inner}</w:tc></w:tr></w:tbl>`
		const result = await readDocx(docx({ body: outer }))

		const cell = blocks(result.content)[0]?.content?.[0]?.content?.[0]
		const texts = (cell?.content ?? []).map(textOf)
		expect(texts.join(' ')).toContain('dalam A')
		expect(texts.join(' ')).toContain('dalam B')
		expect((cell?.content ?? []).some((block) => block.type === 'table')).toBe(false)
	})
})

describe('celah impor — media (D1/D2/D3)', () => {
	const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

	const anchor = (embedId: string) =>
		`<w:drawing xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">
		<wp:anchor><wp:extent cx="9525" cy="9525"/><wp:docPr id="1" name="logo"/>
		<a:graphic><a:graphicData><pic:pic><pic:blipFill><a:blip r:embed="${embedId}"/></pic:blipFill><pic:spPr/></pic:pic></a:graphicData></a:graphic></wp:anchor></w:drawing>`

	test('gambar mengambang (wp:anchor) masuk sebagai image', async () => {
		const rels = `<Relationship Id="rIdA" Type="${REL_NS}/image" Target="media/logo.png"/>`
		const result = await readDocx(
			docx({ body: p(`<w:r>${anchor('rIdA')}</w:r>`), rels, media: { 'media/logo.png': PNG } }),
		)

		const image = blocks(result.content).find((block) => block.type === 'image')
		expect(image).toBeDefined()
		expect(String(image?.attrs?.src)).toMatch(/^data:image\/png;base64,/)
	})

	test('isi kotak teks (mc:AlternateContent → fallback VML) jadi paragraf', async () => {
		const MC = 'xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006"'
		const V = 'xmlns:v="urn:schemas-microsoft-com:vml"'
		const ac = `<mc:AlternateContent ${MC}><mc:Choice Requires="wps"><w:drawing/></mc:Choice>
			<mc:Fallback><w:pict ${V}><v:shape><v:textbox><w:txbxContent>${p(r('isi kotak'))}</w:txbxContent></v:textbox></v:shape></w:pict></mc:Fallback></mc:AlternateContent>`
		const result = await readDocx(docx({ body: p(`<w:r>${ac}</w:r>`) }))

		expect(textOf(blocks(result.content)[0])).toContain('isi kotak')
	})

	test('pratinjau objek tertanam (PNG) masuk, EMF dilaporkan', async () => {
		const rels = `
			<Relationship Id="rIdP" Type="${REL_NS}/image" Target="media/objek.png"/>
			<Relationship Id="rIdE" Type="${REL_NS}/image" Target="media/objek.emf"/>`
		const V = 'xmlns:v="urn:schemas-microsoft-com:vml"'
		const objek = (rid: string) =>
			`<w:object><v:shape ${V} style="width:87.45pt;height:29.45pt"><v:imagedata r:id="${rid}"/></v:shape></w:object>`
		const body = p(`<w:r>${objek('rIdP')}</w:r>`) + p(`<w:r>${objek('rIdE')}</w:r>`)
		const result = await readDocx(
			docx({ body, rels, media: { 'media/objek.png': PNG, 'media/objek.emf': PNG } }),
		)

		const images = blocks(result.content).filter((block) => block.type === 'image')
		expect(images).toHaveLength(1)
		expect(result.warnings.map((warning) => warning.message).join('\n')).toContain('EMF')
	})
})

describe('celah impor — revisi & peringatan (D7/S7)', () => {
	test('revisi terlacak dihitung dan dilaporkan', async () => {
		const body = p(`<w:ins>${r('baru')}</w:ins><w:del><w:r><w:delText>lama</w:delText></w:r></w:del>`)
		const result = await readDocx(docx({ body }))

		const messages = result.warnings.map((warning) => warning.message)
		expect(messages.join('\n')).toContain('2 revisi terlacak')
		// Sebab ini punya kalimatnya sendiri; ia tidak boleh muncul lagi
		// sebagai nama tag mentah di daftar "tidak dikenali".
		expect(messages.join('\n')).not.toContain('revisi.')
	})

	test('tautan internal dilaporkan, teksnya tetap masuk', async () => {
		const result = await readDocx(
			docx({ body: p(`<w:hyperlink w:anchor="_Toc1">${r('Bab I')}</w:hyperlink>`) }),
		)
		expect(textOf(blocks(result.content)[0])).toBe('Bab I')
		expect(result.warnings.map((warning) => warning.message).join('\n')).toContain('tautan internal')
	})
})

describe('celah impor — catatan kaki (D4)', () => {
	test('footnoteReference menjadi footnoteRef dan isi catatannya di akhir', async () => {
		const body = p(`${r('naskah')}<w:r><w:footnoteReference w:id="2"/></w:r>`)
		const footnotes = `<?xml version="1.0"?><w:footnotes ${W}>
			<w:footnote w:type="separator" w:id="-1"><w:p><w:r><w:separator/></w:r></w:p></w:footnote>
			<w:footnote w:type="continuationSeparator" w:id="0"><w:p><w:r><w:continuationSeparator/></w:r></w:p></w:footnote>
			<w:footnote w:id="2"><w:p>${r('catatan pinggir')}</w:p></w:footnote>
		</w:footnotes>`
		const rels = `<Relationship Id="rIdFn" Type="${REL_NS}/footnotes" Target="footnotes.xml"/>`
		const { unzipSync } = await import('fflate')
		const data = docx({ body, rels })
		const withFootnotes = zipSync({ ...unzipSync(data), 'word/footnotes.xml': strToU8(footnotes) })
		const result = await readDocx(withFootnotes)

		const paragraf = blocks(result.content)[0]
		expect(paragraf?.content?.map((node) => node.type)).toEqual(['text', 'footnoteRef'])
		const note = blocks(result.content).at(-1)
		expect(note?.type).toBe('footnote')
		expect(textOf(note)).toBe('catatan pinggir')
	})
})

describe('celah impor — daftar isi (S3/S5)', () => {
	test('field TOC lintas paragraf ditelan utuh menjadi satu TocBlock', async () => {
		const open = `<w:p><w:r><w:fldChar w:fldCharType="begin"/></w:r>
			<w:r><w:instrText xml:space="preserve"> TOC \\o "1-3" \\h </w:instrText></w:r>
			<w:r><w:fldChar w:fldCharType="separate"/></w:r>${r('entri lama 1')}</w:p>`
		const middle = p(r('entri lama 2'))
		const close = `<w:p>${r('entri lama 3')}<w:r><w:fldChar w:fldCharType="end"/></w:r></w:p>`
		const result = await readDocx(docx({ body: open + middle + close }))

		const types = blocks(result.content).map((block) => block.type)
		expect(types).toEqual(['tocBlock'])
		expect(blocks(result.content)[0]?.attrs?.maxLevel).toBe(3)
	})

	test('field TOC \\c "Gambar" menjadi daftar gambar', async () => {
		const field = `<w:p><w:r><w:fldChar w:fldCharType="begin"/></w:r>
			<w:r><w:instrText xml:space="preserve"> TOC \\c "Gambar" </w:instrText></w:r>
			<w:r><w:fldChar w:fldCharType="separate"/></w:r>${r('Gambar 1')}</w:p><w:p><w:r><w:fldChar w:fldCharType="end"/></w:r></w:p>`
		const result = await readDocx(docx({ body: field }))
		expect(blocks(result.content)[0]?.attrs?.listKind).toBe('gambar')
	})

	test('daftar isi manual tiga baris tab diganti TocBlock, sisanya tetap', async () => {
		const tocLines =
			p(`${r('Bab Satu')}<w:r><w:tab/></w:r>${r('3')}`) +
			p(`${r('Bab Dua')}<w:r><w:tab/></w:r>${r('7')}`) +
			p(`${r('Bab Tiga')}<w:r><w:tab/></w:r>${r('9')}`)
		const result = await readDocx(docx({ body: tocLines + p(r('naskah')) }))

		expect(blocks(result.content)[0]?.type).toBe('tocBlock')
		expect(blocks(result.content)[1]?.type).toBe('paragraph')
	})

	/*
	 * Daftar isi bawaan Word memakai switch \h: tiap entri adalah field
	 * PAGEREF/HYPERLINK tersendiri lengkap dengan begin…end sendiri. Versi
	 * pertama menutup field TOC pada `end` mana pun, jadi ia berhenti di entri
	 * pertama - sisanya bocor sebagai paragraf basi, lalu tertangkap
	 * replaceManualToc dan menghasilkan DUA daftar isi berturut-turut.
	 */
	test('entri ber-PAGEREF tidak menutup field TOC lebih awal', async () => {
		const entry = (label: string, page: string) =>
			`<w:p><w:r><w:fldChar w:fldCharType="begin"/></w:r>
			<w:r><w:instrText xml:space="preserve"> PAGEREF _Toc1 \\h </w:instrText></w:r>
			<w:r><w:fldChar w:fldCharType="separate"/></w:r>${r(`${label}\t${page}`)}
			<w:r><w:fldChar w:fldCharType="end"/></w:r></w:p>`

		const body =
			p(r('Sebelum')) +
			`<w:p><w:r><w:fldChar w:fldCharType="begin"/></w:r>
				<w:r><w:instrText xml:space="preserve"> TOC \\o "1-3" \\h </w:instrText></w:r>
				<w:r><w:fldChar w:fldCharType="separate"/></w:r></w:p>` +
			entry('Bab 1 Pendahuluan', '1') +
			entry('Bab 2 Tinjauan', '5') +
			entry('Bab 3 Metode', '9') +
			entry('Bab 4 Hasil', '15') +
			`<w:p><w:r><w:fldChar w:fldCharType="end"/></w:r></w:p>` +
			p(r('Sesudah'))

		const types = blocks(await readDocx(docx({ body })).then((result) => result.content)).map(
			(block) => block.type,
		)
		expect(types.filter((type) => type === 'tocBlock')).toHaveLength(1)
		expect(types).toEqual(['paragraph', 'tocBlock', 'paragraph'])
	})

	test('field TOC tanpa penutup berhenti di pengaman dan dilaporkan', async () => {
		const open = `<w:p><w:r><w:fldChar w:fldCharType="begin"/></w:r>
			<w:r><w:instrText xml:space="preserve"> TOC \\o "1-3" </w:instrText></w:r>
			<w:r><w:fldChar w:fldCharType="separate"/></w:r></w:p>`
		const body = open + p(r('entri')).repeat(600)
		const result = await readDocx(docx({ body }))

		expect(blocks(result.content).filter((block) => block.type === 'tocBlock')).toHaveLength(1)
		expect(result.warnings.some((warning) => warning.message.includes('tidak punya penutup'))).toBe(true)
		// Sebab yang punya kalimat sendiri tidak boleh muncul lagi sebagai tag mentah.
		expect(result.warnings.some((warning) => warning.message.includes('daftar-isi-tanpa-penutup'))).toBe(
			false,
		)
	})

	test('baris tab kurang dari tiga dibiarkan sebagai paragraf', async () => {
		const tocLines =
			p(`${r('Mengetahui')}<w:r><w:tab/></w:r>${r('3')}`) + p(`${r('Bandung')}<w:r><w:tab/></w:r>${r('7')}`)
		const result = await readDocx(docx({ body: tocLines }))
		expect(blocks(result.content).every((block) => block.type === 'paragraph')).toBe(true)
	})
})

describe('celah impor — komentar Word (D5)', () => {
	test('rentang komentar menjadi mark, isinya jadi thread ber nama aslinya', async () => {
		const body = p(
			`<w:commentRangeStart w:id="7"/>${r('frasa yang dikomentari')}<w:commentRangeEnd w:id="7"/><w:r><w:commentReference w:id="7"/></w:r>`,
		)
		const comments = `<?xml version="1.0"?><w:comments ${W}>
			<w:comment w:id="7" w:author="Budi Reviewer" w:date="2026-09-01T10:00:00Z"><w:p>${r('tolong dirapikan')}</w:p></w:comment>
		</w:comments>`
		const rels = `<Relationship Id="rIdC" Type="${REL_NS}/comments" Target="comments.xml"/>`
		const { unzipSync } = await import('fflate')
		const data = docx({ body, rels })
		const withComments = zipSync({ ...unzipSync(data), 'word/comments.xml': strToU8(comments) })
		const result = await readDocx(withComments)

		const mark = markNamed(blocks(result.content)[0], 'comment')
		expect(mark?.attrs?.commentId).toBe('w-7')
		expect(result.comments).toHaveLength(1)
		expect(result.comments[0]?.author).toBe('Budi Reviewer')
		expect(result.comments[0]?.replies[0]?.text).toBe('tolong dirapikan')
		expect(result.comments[0]?.quote).toBe('frasa yang dikomentari')
	})
})
