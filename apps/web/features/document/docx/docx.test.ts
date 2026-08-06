import { describe, expect, test } from 'bun:test'
import type { JSONContent } from '@tiptap/core'
import { strToU8, zipSync } from 'fflate'
import { readDocx } from './index'

/**
 * Yang diuji di sini adalah hal-hal yang membuat hasil impor terasa keliru di
 * dokumen sungguhan: gaya bawaan Word yang menyimpan sifatnya di styles.xml,
 * gaya turunan yang hanya membatalkan sebagian induknya, dan kode field yang
 * kalau ikut terbaca akan muncul sebagai teks asing di tengah naskah.
 */

const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"'
const R = 'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"'
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
	/** Berkas media tambahan, misalnya gambar yang dirujuk `w:drawing`. */
	media?: Record<string, Uint8Array>
}): Uint8Array {
	const mediaPart = media ? Object.fromEntries(
		Object.entries(media).map(([path, bytes]) => [
			path.startsWith('word/') ? path : `word/${path}`,
			bytes,
		]),
	) : {}
	const numberingRel = numbering
		? `<Relationship Id="rIdNum" Type="${REL_NS}/numbering" Target="numbering.xml"/>`
		: ''
	const numberingPart = numbering
		? {
				'word/numbering.xml': strToU8(
					`<?xml version="1.0"?><w:numbering ${W}>${numbering}</w:numbering>`,
				),
			}
		: {}

	const themeRel = theme ? `<Relationship Id="rIdTheme" Type="${REL_NS}/theme" Target="theme/theme1.xml"/>` : ''
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
			`<?xml version="1.0"?><w:document ${W} ${R}><w:body>${body}</w:body></w:document>`,
		),
	})
}

/** Paragraf teks biasa, ditulis pendek supaya isi tesnya yang terbaca. */
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

/**
 * Mark penekanan sebuah run.
 *
 * `textStyle` sengaja tidak ikut: ia hampir selalu ada - rupa dan ukuran huruf
 * ditulis pada tiap run - jadi memasukkannya membuat tes tentang tebal-miring
 * ikut goyah tiap kali urusan rupa huruf berubah.
 */
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
		// `<w:b w:val="0"/>` adalah satu-satunya cara Word mematikan sifat yang
		// datang dari gaya; membacanya sebagai "ada, berarti tebal" akan
		// menebalkan justru bagian yang sengaja dinormalkan.
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
	/**
	 * Persis kasus "Caption Tabel" di dokumen nyata: tebalnya tidak pernah
	 * disebut di paragrafnya, hanya di styles.xml. Inilah yang membuat seluruh
	 * caption datang sebagai teks biasa saat impor masih lewat mammoth.
	 */
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

	/**
	 * Gaya bernama bebas tidak akan pernah cocok dengan pencocokan nama, tapi
	 * ia mewarisi outlineLvl dari induknya - dan di dokumen nyata justru gaya
	 * semacam inilah yang dipakai untuk judul bab.
	 */
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
	/**
	 * Sebuah field menyimpan dua hal: kodenya dan hasil terakhirnya. Word hanya
	 * pernah menampilkan hasilnya. Kalau kodenya ikut terbaca, daftar isi masuk
	 * ke naskah diawali teks semacam ` TOC \\o "1-4" \\h `.
	 */
	test('kode field tidak jadi teks, hasilnya iya', async () => {
		const field = `
			<w:r><w:fldChar w:fldCharType="begin"/></w:r>
			<w:r><w:instrText xml:space="preserve"> TOC \\o "1-4" \\h </w:instrText></w:r>
			<w:r><w:fldChar w:fldCharType="separate"/></w:r>
			${r('BAB I PENDAHULUAN')}
			<w:r><w:fldChar w:fldCharType="end"/></w:r>`
		const result = await readDocx(docx({ body: p(field) }))

		expect(textOf(blocks(result.content)[0])).toBe('BAB I PENDAHULUAN')
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

	/** Isian daftar isi menunjuk penanda di dalam dokumen; tautannya buntu di editor. */
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
	/**
	 * Tabel kini terbawa, bukan dilewati. Yang masih dilaporkan hanyalah sifat
	 * yang belum punya padanan - di sini penggabungan sel, yang membuat tabel
	 * gagal dirender apa adanya.
	 */
	test('tabel bersih tidak lagi dilaporkan sebagai hilang', async () => {
		const table = `<w:tbl><w:tr><w:tc>${p(r('sel'))}</w:tc></w:tr></w:tbl>`
		const result = await readDocx(docx({ body: table + table }))

		expect(result.warnings).toEqual([])
	})

	test('penggabungan sel tabel tetap dilaporkan apa adanya', async () => {
		const table = `<w:tbl><w:tr><w:tc><w:tcPr><w:gridSpan w:val="2"/></w:tcPr>${p(r('gabung'))}</w:tc></w:tr></w:tbl>`
		const result = await readDocx(docx({ body: table }))

		expect(result.warnings.map((warning) => warning.message)).toContain(
			'1 sel gabungan tabel belum ikut terbawa dan akan menyusul.',
		)
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

	/** Baris judul Word (`tblHeader`) menjadi baris `tableHeader` yang berulang. */
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

	/** Format di dalam sel mengikuti jalur paragraf biasa - termasuk tebal. */
	test('tebal di dalam sel ikut terbawa', async () => {
		const table = `<w:tbl><w:tr><w:tc>${p(r('tegas', '<w:b/>'))}</w:tc></w:tr></w:tbl>`
		const block = blocks((await readDocx(docx({ body: table }))).content)[0]
		// table → row → cell → paragraf di dalamnya; marksOf membaca run pertamanya.
		const cellParagraph = block?.content?.[0]?.content?.[0]?.content?.[0]
		expect(marksOf(cellParagraph)).toContain('bold')
	})

	test('perataan vertikal sel jadi gaya CSS', async () => {
		const table = `<w:tbl><w:tr><w:tc><w:tcPr><w:vAlign w:val="center"/></w:tcPr>${p(r('isi'))}</w:tc></w:tr></w:tbl>`
		const cell = blocks((await readDocx(docx({ body: table }))).content)[0]?.content?.[0]?.content?.[0]
		expect(String(cell?.attrs?.style)).toContain('vertical-align: middle')
	})

	test('margin sel twip jadi padding piksel', async () => {
		const table = `<w:tbl><w:tr><w:tc><w:tcPr><w:tcMar><w:top w:w="60" w:type="dxa"/><w:left w:w="85" w:type="dxa"/></w:tcMar></w:tcPr>${p(r('isi'))}</w:tc></w:tr></w:tbl>`
		const cell = blocks((await readDocx(docx({ body: table }))).content)[0]?.content?.[0]?.content?.[0]
		expect(String(cell?.attrs?.style)).toContain('padding:')
		expect(String(cell?.attrs?.style)).toContain('top: 4px')
	})

	test('tabel rata tengah membawa perataannya', async () => {
		const table = `<w:tbl><w:tblPr><w:jc w:val="center"/></w:tblPr><w:tr><w:tc>${p(r('isi'))}</w:tc></w:tr></w:tbl>`
		const block = blocks((await readDocx(docx({ body: table }))).content)[0]
		expect(block?.attrs?.textAlign).toBe('center')
	})
})

describe('gambar', () => {
	// PNG 1x1 piksel valid terkecil, dipakai sebagai media uji.
	const PNG_1x1 = Uint8Array.from([
		0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, // tanda tangan
		0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52, // IHDR
		0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, // lebar=1, tinggi=1
		0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4, 0x89,
		0x00, 0x00, 0x00, 0x0d, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0x00, 0x01,
		0x00, 0x00, 0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4,
		0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
	])

	/** `wp:extent` 9525 EMU = 1 piksel di 96 dpi. */
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

	/** Ukuran tampilan dari extent (EMU) dipakai, bukan resolusi piksel berkas. */
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

	/** Hubungan atau media yang hilang tidak boleh membuat naskah rusak. */
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
		// 720 twip adalah setengah inci, yang di layar 96 dpi berarti 48 px.
		const result = await readDocx(docx({ body: p(r('isi'), '<w:ind w:left="720"/>') }))
		expect(blocks(result.content)[0]?.attrs?.indentLeft).toBe(48)
	})

	test('hanging jadi indentasi baris pertama yang negatif', async () => {
		const result = await readDocx(docx({ body: p(r('isi'), '<w:ind w:left="720" w:hanging="360"/>') }))
		const attrs = blocks(result.content)[0]?.attrs

		expect(attrs?.indentLeft).toBe(48)
		expect(attrs?.indentFirstLine).toBe(-24)
	})

	/**
	 * Atribut di dalam `w:ind` diwariskan satu per satu, bukan sebagai satu
	 * kesatuan. Gaya yang hanya menyebut `left` tidak membatalkan `hanging` yang
	 * datang dari bawaan dokumen - dan di dokumen nyata itulah yang terjadi pada
	 * seluruh paragraf daftar.
	 */
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
		// Kelipatan Word diukur terhadap tinggi baris alami font, kelipatan CSS
		// terhadap ukuran hurufnya; memakai 1.5 apa adanya akan merapatkan naskah.
		const result = await readDocx(
			docx({ body: p(r('isi'), '<w:spacing w:line="360" w:lineRule="auto"/>') }),
		)
		expect(blocks(result.content)[0]?.attrs?.lineHeight).toBe('1.73')
	})

	test('spasi tunggal jadi normal, bukan angka', async () => {
		const result = await readDocx(
			docx({ body: p(r('isi'), '<w:spacing w:line="240" w:lineRule="auto"/>') }),
		)
		expect(blocks(result.content)[0]?.attrs?.lineHeight).toBe('normal')
	})

	test('spasi pasti dinyatakan dalam piksel', async () => {
		const result = await readDocx(
			docx({ body: p(r('isi'), '<w:spacing w:line="360" w:lineRule="exact"/>') }),
		)
		expect(blocks(result.content)[0]?.attrs?.lineHeight).toBe('24px')
	})

	/** Diamnya Word berarti rapat, sedangkan diamnya editor berarti renggang. */
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
		const result = await readDocx(
			docx({ body: p(r('isi', '<w:rFonts w:ascii="Times New Roman"/>')) }),
		)
		expect(textStyle(blocks(result.content)[0])?.fontFamily).toBe('"Times New Roman", serif')
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

	/**
	 * Bawaan dokumen menyebut font lewat tema, lalu gaya Normal menimpanya dengan
	 * nama tegas. Kalau rujukan tema yang menang, seluruh naskah berganti rupa.
	 */
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

	/** `w:default` adalah atribut, bukan anak - salah baca dan Normal tak pernah dipakai. */
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

	/**
	 * Judul di naskah ilmiah kerap setipis teks isi. Tanpa pernyataan tegas ini,
	 * CSS editor yang menebalkan judul akan menang dan mengubah rupa dokumen.
	 */
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
	/** Susunan bab khas naskah ilmiah: "BAB I", lalu "1.1", lalu "1.1.1". */
	const BERTINGKAT = `
		<w:abstractNum w:abstractNumId="0">
			<w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="upperRoman"/><w:lvlText w:val="BAB %1"/></w:lvl>
			<w:lvl w:ilvl="1"><w:start w:val="1"/><w:numFmt w:val="decimal"/><w:lvlText w:val="%1.%2"/></w:lvl>
			<w:lvl w:ilvl="2"><w:start w:val="1"/><w:numFmt w:val="decimal"/><w:lvlText w:val="%1.%2.%3"/></w:lvl>
		</w:abstractNum>
		<w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num>`

	const numbered = (ilvl: number, numId = 1) =>
		`<w:numPr><w:ilvl w:val="${ilvl}"/><w:numId w:val="${numId}"/></w:numPr>`

	const numbersOf = (document: JSONContent) =>
		blocks(document).map((block) => block.attrs?.blockNumber ?? null)

	test('deret bertingkat menghitung seperti Word', async () => {
		const body =
			p(r('Satu'), numbered(0)) +
			p(r('a'), numbered(1)) +
			p(r('b'), numbered(1)) +
			p(r('i'), numbered(2)) +
			p(r('Dua'), numbered(0))
		const result = await readDocx(docx({ numbering: BERTINGKAT, body }))

		expect(numbersOf(result.content)).toEqual(['BAB I', 'I.1', 'I.2', 'I.2.1', 'BAB II'])
	})

	test('tingkat yang lebih dalam dimulai ulang oleh tingkat di atasnya', async () => {
		const body =
			p(r('a'), numbered(0)) +
			p(r('a1'), numbered(1)) +
			p(r('b'), numbered(0)) +
			p(r('b1'), numbered(1))
		const result = await readDocx(docx({ numbering: BERTINGKAT, body }))

		expect(numbersOf(result.content)).toEqual(['BAB I', 'I.1', 'BAB II', 'II.1'])
	})

	/** Dua numId adalah dua deret terpisah, meski bentuknya satu definisi. */
	test('deret yang berbeda menghitung sendiri-sendiri', async () => {
		const numbering = `${BERTINGKAT}<w:num w:numId="2"><w:abstractNumId w:val="0"/></w:num>`
		const body =
			p(r('satu'), numbered(0, 1)) + p(r('lain'), numbered(0, 2)) + p(r('dua'), numbered(0, 1))
		const result = await readDocx(docx({ numbering, body }))

		expect(numbersOf(result.content)).toEqual(['BAB I', 'BAB I', 'BAB II'])
	})

	test('startOverride menggeser awal hitungan deretnya', async () => {
		const numbering = `${BERTINGKAT}
			<w:num w:numId="3"><w:abstractNumId w:val="0"/>
				<w:lvlOverride w:ilvl="0"><w:startOverride w:val="4"/></w:lvlOverride>
			</w:num>`
		const result = await readDocx(docx({ numbering, body: p(r('bab'), numbered(0, 3)) }))

		expect(numbersOf(result.content)).toEqual(['BAB IV'])
	})

	/**
	 * numId 0 bukan deret bernomor nol - ia cara Word membatalkan penomoran yang
	 * datang dari gaya paragrafnya.
	 */
	test('numId nol berarti justru tidak bernomor', async () => {
		const styles = `<w:style w:type="paragraph" w:styleId="Bab">
			<w:name w:val="Bab"/><w:pPr>${numbered(0)}<w:outlineLvl w:val="0"/></w:pPr></w:style>
			<w:style w:type="paragraph" w:styleId="BabTanpaNomor">
			<w:name w:val="Bab tanpa nomor"/><w:basedOn w:val="Bab"/>
			<w:pPr><w:numPr><w:numId w:val="0"/></w:numPr></w:pPr></w:style>`
		const body =
			p(r('Bernomor'), '<w:pStyle w:val="Bab"/>') +
			p(r('Daftar Pustaka'), '<w:pStyle w:val="BabTanpaNomor"/>')
		const result = await readDocx(docx({ numbering: BERTINGKAT, styles, body }))

		expect(numbersOf(result.content)).toEqual(['BAB I', null])
		// Keduanya tetap judul: yang dibatalkan penomorannya, bukan tingkatnya.
		expect(blocks(result.content).map((block) => block.type)).toEqual(['heading', 'heading'])
	})

	test('penomoran pada paragraf menang atas penomoran dari gayanya', async () => {
		const numbering = `${BERTINGKAT}
			<w:abstractNum w:abstractNumId="9">
				<w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="decimal"/><w:lvlText w:val="Bagian %1"/></w:lvl>
			</w:abstractNum>
			<w:num w:numId="9"><w:abstractNumId w:val="9"/></w:num>`
		const styles = `<w:style w:type="paragraph" w:styleId="Bab"><w:name w:val="Bab"/><w:pPr>${numbered(0)}</w:pPr></w:style>`
		const result = await readDocx(
			docx({ numbering, styles, body: p(r('isi'), `<w:pStyle w:val="Bab"/>${numbered(0, 9)}`) }),
		)

		expect(numbersOf(result.content)).toEqual(['Bagian 1'])
	})

	test('butir Wingdings jadi bulatan, bukan kotak kosong', async () => {
		//  hanya berarti bulatan di font Symbol, yang tidak dipunyai peramban.
		const numbering = `
			<w:abstractNum w:abstractNumId="5">
				<w:lvl w:ilvl="0"><w:numFmt w:val="bullet"/><w:lvlText w:val=""/></w:lvl>
			</w:abstractNum>
			<w:num w:numId="5"><w:abstractNumId w:val="5"/></w:num>`
		const result = await readDocx(docx({ numbering, body: p(r('butir'), numbered(0, 5)) }))

		expect(numbersOf(result.content)).toEqual(['•'])
	})

	test('nomor tidak ikut jadi teks paragrafnya', async () => {
		const result = await readDocx(docx({ numbering: BERTINGKAT, body: p(r('Pendahuluan'), numbered(0)) }))
		expect(textOf(blocks(result.content)[0])).toBe('Pendahuluan')
	})

	test('rupa nomor diambil dari properti tanda paragraf', async () => {
		const body = p(r('isi'), `${numbered(0)}<w:rPr><w:b/></w:rPr><w:ind w:left="720" w:hanging="720"/>`)
		const style = blocks((await readDocx(docx({ numbering: BERTINGKAT, body }))).content)[0]?.attrs
			?.numberStyle as string

		expect(style).toContain('--number-weight: bold')
		expect(style).toContain('--number-width: 48px')
	})

	test('dokumen tanpa bagian penomoran tetap terbaca', async () => {
		const result = await readDocx(docx({ body: p(r('isi'), numbered(0)) }))

		expect(numbersOf(result.content)).toEqual([null])
		expect(textOf(blocks(result.content)[0])).toBe('isi')
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
