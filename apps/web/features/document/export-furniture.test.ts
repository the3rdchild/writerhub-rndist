import { describe, expect, test } from 'bun:test'
import { strFromU8, unzipSync } from 'fflate'
import { DEFAULT_PAGE_SETUP, pageGeometry } from '@/features/editor/page-geometry'
import { buildSchema } from '@/features/sync/serialize'
import { exportDocx } from './export-docx'

async function xmlOf(options: {
	furniture?: Parameters<typeof exportDocx>[1]['furniture']
	part: 'word/document.xml' | string
}): Promise<string> {
	const doc = buildSchema().nodeFromJSON({
		type: 'doc',
		content: [{ type: 'paragraph', content: [{ type: 'text', text: 'isi' }] }],
	})
	const blob = await exportDocx(doc, {
		title: 'uji',
		geometry: pageGeometry(DEFAULT_PAGE_SETUP),
		setup: DEFAULT_PAGE_SETUP,
		...(options.furniture !== undefined ? { furniture: options.furniture } : {}),
	})
	const bytes = unzipSync(new Uint8Array(await blob.arrayBuffer()))[options.part]
	return bytes ? strFromU8(bytes) : ''
}

describe('ekspor perabot halaman', () => {
	test('footer default menghasilkan part footer berisi teks dan field PAGE', async () => {
		const footer = await xmlOf({
			furniture: { footer: { default: { text: 'halo {page}', align: 'center' } } },
			part: 'word/footer1.xml',
		})

		expect(footer).toContain('halo')
		expect(footer).toMatch(/PAGE/)
		expect(footer).toContain('<w:jc w:val="center"/>')
	})

	test('varian first menyalakan titlePage dan footerReference first', async () => {
		const xml = await xmlOf({
			furniture: { footer: { first: { text: 'awal', align: 'left' } } },
			part: 'word/document.xml',
		})

		expect(xml).toContain('<w:titlePg/>')
		expect(xml).toMatch(/<w:footerReference w:type="first"/)
	})

	test('header default ikut sebagai headerReference default', async () => {
		const xml = await xmlOf({
			furniture: { header: { default: { text: 'kepala', align: 'right' } } },
			part: 'word/document.xml',
		})

		expect(xml).toMatch(/<w:headerReference w:type="default"/)
		const header = await xmlOf({
			furniture: { header: { default: { text: 'kepala', align: 'right' } } },
			part: 'word/header1.xml',
		})
		expect(header).toContain('kepala')
	})

	test('tanpa furniture tidak ada referensi header/footer', async () => {
		const xml = await xmlOf({ furniture: null, part: 'word/document.xml' })
		expect(xml).not.toMatch(/headerReference|footerReference/)
	})
})
