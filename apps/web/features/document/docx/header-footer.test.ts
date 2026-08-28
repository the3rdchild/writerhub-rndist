import { describe, expect, test } from 'bun:test'
import { strToU8, zipSync } from 'fflate'
import { readFurniture } from './header-footer'
import { createXmlParser } from './xml'
import { openDocx } from './zip'

const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"'
const R = 'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"'
const REL_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'

function docxWith({
	body,
	footer = '',
	header = '',
	footerRels = '',
	headerRels = '',
}: {
	body: string
	footer?: string
	header?: string
	footerRels?: string
	headerRels?: string
}): Uint8Array {
	const parts: Record<string, Uint8Array> = {
		'_rels/.rels': strToU8(
			`<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
			<Relationship Id="rId1" Type="${REL_NS}/officeDocument" Target="word/document.xml"/>
			</Relationships>`,
		),
		'word/_rels/document.xml.rels': strToU8(
			`<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
			${footerRels}
			${headerRels}
			</Relationships>`,
		),
		'word/document.xml': strToU8(
			`<?xml version="1.0"?><w:document ${W} ${R}><w:body>${body}</w:body></w:document>`,
		),
	}
	if (footer) parts['word/footer1.xml'] = strToU8(`<?xml version="1.0"?><w:ftr ${W}>${footer}</w:ftr>`)
	if (header) parts['word/header1.xml'] = strToU8(`<?xml version="1.0"?><w:hdr ${W}>${header}</w:hdr>`)
	return zipSync(parts)
}

const FOOTER_REL = `<Relationship Id="rIdF" Type="${REL_NS}/footer" Target="footer1.xml"/>`
const HEADER_REL = `<Relationship Id="rIdH" Type="${REL_NS}/header" Target="header1.xml"/>`

async function furnitureOf(bytes: Uint8Array) {
	return readFurniture(openDocx(bytes), await createXmlParser(), 'word/document.xml')
}

describe('impor header/footer', () => {
	test('footerReference first terbaca sebagai footer.first', async () => {
		const bytes = docxWith({
			body: `<w:p><w:r><w:t>isi</w:t></w:r></w:p><w:sectPr>
				<w:footerReference w:type="first" r:id="rIdF"/>
			</w:sectPr>`,
			footer: '<w:p><w:r><w:t>©2026 IEEE</w:t></w:r></w:p>',
			footerRels: FOOTER_REL,
		})

		expect(await furnitureOf(bytes)).toEqual({
			footer: { first: { text: '©2026 IEEE', align: 'left' } },
		})
	})

	test('field PAGE jadi token {page}', async () => {
		const bytes = docxWith({
			body: `<w:sectPr><w:footerReference r:id="rIdF"/></w:sectPr>`,
			footer: `<w:p>
				<w:r><w:fldChar w:fldCharType="begin"/></w:r>
				<w:r><w:instrText> PAGE </w:instrText></w:r>
				<w:r><w:fldChar w:fldCharType="end"/></w:r>
			</w:p>`,
			footerRels: FOOTER_REL,
		})

		expect(await furnitureOf(bytes)).toEqual({
			footer: { default: { text: '{page}', align: 'left' } },
		})
	})

	test('perataan tengah diikuti, run terpecah digabung', async () => {
		const bytes = docxWith({
			body: `<w:sectPr><w:footerReference r:id="rIdF"/></w:sectPr>`,
			footer: `<w:p><w:pPr><w:jc w:val="center"/></w:pPr>
				<w:r><w:t>halo </w:t></w:r><w:r><w:t>dunia</w:t></w:r>
			</w:p>`,
			footerRels: FOOTER_REL,
		})

		expect(await furnitureOf(bytes)).toEqual({
			footer: { default: { text: 'halo dunia', align: 'center' } },
		})
	})

	test('headerReference default terbaca sebagai header.default', async () => {
		const bytes = docxWith({
			body: `<w:sectPr><w:headerReference w:type="default" r:id="rIdH"/></w:sectPr>`,
			header: '<w:p><w:pPr><w:jc w:val="right"/></w:pPr><w:r><w:t>Judul</w:t></w:r></w:p>',
			headerRels: HEADER_REL,
		})

		expect(await furnitureOf(bytes)).toEqual({
			header: { default: { text: 'Judul', align: 'right' } },
		})
	})

	test('referensi pertama menang, section berikut tidak menimpa', async () => {
		const bytes = docxWith({
			body: `<w:sectPr><w:footerReference r:id="rIdF"/></w:sectPr>
				<w:p><w:r><w:t>lanjut</w:t></w:r></w:p>
				<w:sectPr><w:footerReference r:id="rIdF"/></w:sectPr>`,
			footer: '<w:p><w:r><w:t>satu</w:t></w:r></w:p>',
			footerRels: FOOTER_REL,
		})

		const furniture = await furnitureOf(bytes)
		expect(furniture?.footer?.default?.text).toBe('satu')
	})

	test('tanpa referensi menghasilkan null', async () => {
		const bytes = docxWith({ body: '<w:p><w:r><w:t>isi</w:t></w:r></w:p>' })
		expect(await furnitureOf(bytes)).toBeNull()
	})

	test('paragraf kosong dilompati, paragraf berisi dipakai', async () => {
		const bytes = docxWith({
			body: `<w:sectPr><w:footerReference r:id="rIdF"/></w:sectPr>`,
			footer: '<w:p></w:p><w:p><w:r><w:t>berisi</w:t></w:r></w:p>',
			footerRels: FOOTER_REL,
		})

		expect(await furnitureOf(bytes)).toEqual({
			footer: { default: { text: 'berisi', align: 'left' } },
		})
	})
})
