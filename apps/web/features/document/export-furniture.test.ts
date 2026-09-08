import { describe, expect, test } from 'bun:test'
import { strFromU8, unzipSync } from 'fflate'
import { DEFAULT_PAGE_SETUP, pageGeometry } from '@/features/editor/page-geometry'
import { buildSchema } from '@/features/sync/serialize'
import { exportDocx } from './export-docx'

async function xmlOf(options: {
	furniture?: Parameters<typeof exportDocx>[1]['furniture']
	setup?: Parameters<typeof exportDocx>[1]['setup']
	showPageNumbers?: boolean
	part: 'word/document.xml' | string
}): Promise<string> {
	const setup = options.setup ?? DEFAULT_PAGE_SETUP
	const doc = buildSchema().nodeFromJSON({
		type: 'doc',
		content: [{ type: 'paragraph', content: [{ type: 'text', text: 'isi' }] }],
	})
	const blob = await exportDocx(doc, {
		title: 'uji',
		geometry: pageGeometry(setup),
		setup,
		...(options.furniture !== undefined ? { furniture: options.furniture } : {}),
		...(options.showPageNumbers !== undefined ? { showPageNumbers: options.showPageNumbers } : {}),
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

	test('bagian dengan show: false mengekspor footer tanpa field PAGE', async () => {
		/* Word tidak punya bendera "sembunyikan nomor"; caranya justru tidak
		 * menulis field-nya. Tanpa ini, penomoran yang dibersihkan di layar
		 * hidup kembali begitu dokumennya diekspor. */
		const footer = await xmlOf({
			furniture: { footer: { default: { text: 'halo {page}', align: 'center' } } },
			setup: {
				...DEFAULT_PAGE_SETUP,
				pageNumbering: { format: 'decimal', restart: 'continue', show: false },
			},
			part: 'word/footer1.xml',
		})

		expect(footer).toContain('halo')
		expect(footer).not.toMatch(/PAGE/)
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

	test('tanpa furniture dan nomor otomatis mati, tidak ada referensi header/footer', async () => {
		const xml = await xmlOf({ furniture: null, showPageNumbers: false, part: 'word/document.xml' })
		expect(xml).not.toMatch(/headerReference|footerReference/)
	})
})

describe('celah ekspor — footer sintesis (opsi A)', () => {
	/*
	 * Dokumen tanpa perabot bernomor di layar lewat lencana cadangan, tapi
	 * DOCX-nya dulu keluar tanpa nomor: tidak ada footer pembawanya. Footer
	 * sintesis menutupnya dengan aturan yang sama dengan lencana.
	 */
	test('dokumen tanpa perabot mendapat footer sintesis berisi field PAGE', async () => {
		const xml = await xmlOf({ furniture: null, part: 'word/document.xml' })
		expect(xml).toMatch(/<w:footerReference w:type="default"/)

		const footer = await xmlOf({ furniture: null, part: 'word/footer1.xml' })
		expect(footer).toMatch(/PAGE/)
		expect(footer).toContain('<w:jc w:val="center"/>')
	})

	test('footer kosong peninggalan impor lama diganti sintesis', async () => {
		const footer = await xmlOf({
			furniture: { footer: { default: { text: '', align: 'center' } } },
			part: 'word/footer1.xml',
		})

		expect(footer).toMatch(/PAGE/)
	})

	test('footer teks statis tidak ditempeli field PAGE (sisa yang jujur)', async () => {
		const footer = await xmlOf({
			furniture: { footer: { default: { text: 'catatan kaki', align: 'left' } } },
			part: 'word/footer1.xml',
		})

		expect(footer).toContain('catatan kaki')
		expect(footer).not.toMatch(/PAGE/)
	})

	test('header pembawa token menghentikan sintesis — nomor tidak digambar dua kali', async () => {
		const xml = await xmlOf({
			furniture: { header: { default: { text: '{page}', align: 'center' } } },
			part: 'word/document.xml',
		})

		expect(xml).toMatch(/<w:headerReference w:type="default"/)
		expect(xml).not.toMatch(/<w:footerReference/)
	})

	test('bagian tanpa nomor mendapat footer sintesis yang kosong, bukan warisan bernomor', async () => {
		const footer = await xmlOf({
			furniture: null,
			setup: {
				...DEFAULT_PAGE_SETUP,
				pageNumbering: { format: 'decimal', restart: 'continue', show: false },
			},
			part: 'word/footer1.xml',
		})

		expect(footer).not.toMatch(/PAGE/)
	})

	test('header genap statis tetap mendapat footer genap sintesis', async () => {
		const xml = await xmlOf({
			furniture: { header: { even: { text: 'kepala genap', align: 'left' } } },
			part: 'word/document.xml',
		})

		expect(xml.match(/<w:footerReference w:type="default"/g)).toHaveLength(1)
		expect(xml.match(/<w:footerReference w:type="even"/g)).toHaveLength(1)
	})
})
