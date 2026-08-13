import { describe, expect, test } from 'bun:test'
import { Schema } from '@tiptap/pm/model'
import { DEFAULT_PAGE_SETUP, INCH } from './page-geometry'
import { columnRegions, sectionSpans } from './section-break'

/**
 * Rentang section diuji tanpa editor: cukup skema minimal berisi paragraph dan
 * sectionBreak, karena `sectionSpans` hanya membaca atribut node tingkat atas.
 */

const schema = new Schema({
	nodes: {
		doc: { content: 'block+' },
		paragraph: { group: 'block', content: 'text*' },
		text: {},
		sectionBreak: {
			group: 'block',
			attrs: {
				pageSetup: { default: null },
				columns: { default: null },
			},
		},
	},
})

function docWith(...breaks: { pageSetup?: object; columns?: object }[]) {
	const content = [schema.node('paragraph')]
	for (const attrs of breaks) {
		content.push(
			schema.node('sectionBreak', {
				pageSetup: attrs.pageSetup ?? null,
				columns: attrs.columns ?? null,
			}),
			schema.node('paragraph'),
		)
	}
	return schema.node('doc', null, content)
}

describe('sectionSpans (§P8&P9)', () => {
	test('tanpa pembatas: satu section dengan setelan dasar', () => {
		const spans = sectionSpans(docWith())
		expect(spans).toHaveLength(1)
		expect(spans[0]).toMatchObject({ pos: 0, setup: DEFAULT_PAGE_SETUP, columns: null })
	})

	test('tiap pembatas memulai section baru yang mewarisi sisanya', () => {
		const spans = sectionSpans(docWith({ pageSetup: { orientation: 'landscape' } }))

		expect(spans).toHaveLength(2)
		expect(spans[1].setup.orientation).toBe('landscape')
		// Hanya orientasi yang berubah; margin mewarisi setelan dasar.
		expect(spans[1].setup.margins).toEqual(DEFAULT_PAGE_SETUP.margins)
	})

	test('perubahan menumpuk: section ketiga mewarisi section kedua, bukan dasar', () => {
		const spans = sectionSpans(
			docWith({ pageSetup: { orientation: 'landscape' } }, { pageSetup: { margins: { top: INCH / 2 } } }),
		)

		expect(spans).toHaveLength(3)
		// Orientasi lanskap dari section kedua tetap berlaku di section ketiga.
		expect(spans[2].setup.orientation).toBe('landscape')
		// Margin: top berubah, sisi lain tetap mewarisi.
		expect(spans[2].setup.margins.top).toBe(INCH / 2)
		expect(spans[2].setup.margins.left).toBe(DEFAULT_PAGE_SETUP.margins.left)
	})

	test('atribut columns ikut ke rentangnya', () => {
		const spans = sectionSpans(docWith({ columns: { count: 2 } }))

		expect(spans[0].columns).toBeNull()
		expect(spans[1].columns).toEqual({ count: 2 })
	})
})


describe('columnRegions (§P8)', () => {
	test('rentang mulai sesudah pembatasnya dan berakhir di pembatas berikutnya', () => {
		const doc = docWith({ columns: { count: 2 } }, { pageSetup: { orientation: 'landscape' } })
		const regions = columnRegions(doc)

		expect(regions).toHaveLength(1)
		// Pembatas pertama di pos 2 (paragraf pertama nodeSize 2), atomik (nodeSize 1).
		expect(regions[0].from).toBe(3)
		// Pembatas kedua mengakhiri rentang walau section-nya tidak berkolom.
		expect(regions[0].to).toBe(5)
	})

	test('section tanpa columns tidak menghasilkan rentang', () => {
		expect(columnRegions(docWith({ pageSetup: { orientation: 'landscape' } }))).toHaveLength(0)
		expect(columnRegions(docWith({ columns: { count: 1 } }))).toHaveLength(0)
	})

	test('rentang terakhir berakhir di ujung dokumen', () => {
		const doc = docWith({ columns: { count: 3 } })
		const regions = columnRegions(doc)

		expect(regions).toHaveLength(1)
		expect(regions[0].to).toBe(doc.content.size)
	})
})
describe('pembatas penutup mengembalikan setelan sebelumnya (§P8&P9)', () => {
	/**
	 * "Halaman ini saja" bekerja dengan mengurung rentang di antara dua pembatas.
	 * Yang diuji di sini bukan perintahnya - itu butuh editor - melainkan sifat
	 * yang membuatnya benar: pembatas penutup yang membawa setelan sebelumnya
	 * SELENGKAPNYA mengembalikan section berikutnya ke keadaan semula, apa pun
	 * yang diubah di tengah.
	 */
	test('section sesudah rentang kembali persis ke setelan dasar', () => {
		const doc = docWith(
			{ pageSetup: { orientation: 'landscape', size: 'a3' } },
			// Penutup membawa setelan dasar selengkapnya, bukan selisihnya.
			{ pageSetup: { ...DEFAULT_PAGE_SETUP } },
		)
		const spans = sectionSpans(doc, DEFAULT_PAGE_SETUP)

		expect(spans).toHaveLength(3)
		expect(spans[1].setup).toMatchObject({ orientation: 'landscape', size: 'a3' })
		expect(spans[2].setup).toEqual(DEFAULT_PAGE_SETUP)
	})

	test('selisih saja tidak cukup - inilah alasan penutup membawa semuanya', () => {
		// Penutup yang hanya membatalkan orientasi meninggalkan ukuran A3 menetap,
		// karena section mewarisi section sebelumnya, bukan setelan dasar.
		const doc = docWith(
			{ pageSetup: { orientation: 'landscape', size: 'a3' } },
			{ pageSetup: { orientation: 'portrait' } },
		)
		const spans = sectionSpans(doc, DEFAULT_PAGE_SETUP)

		expect(spans[2].setup.orientation).toBe('portrait')
		expect(spans[2].setup.size).toBe('a3')
	})

	test('margin ikut dipulihkan, bukan bergabung separuh', () => {
		const narrow = { ...DEFAULT_PAGE_SETUP.margins, left: INCH / 2 }
		const doc = docWith(
			{ pageSetup: { margins: narrow } },
			{ pageSetup: { ...DEFAULT_PAGE_SETUP } },
		)
		const spans = sectionSpans(doc, DEFAULT_PAGE_SETUP)

		expect(spans[1].setup.margins.left).toBe(INCH / 2)
		expect(spans[2].setup.margins).toEqual(DEFAULT_PAGE_SETUP.margins)
	})
})

describe('kolom section tidak diwarisi (§P8)', () => {
	/**
	 * Kolom berbeda sifat dari setelan halaman: `sectionSpans` membaca atribut
	 * tiap pembatas apa adanya, tanpa menggabungkannya dengan section sebelumnya.
	 * Itu yang membuat pembatas penutup `columns: null` benar-benar berarti
	 * "kembali satu kolom" - dan `applySectionColumns` bersandar padanya.
	 */
	test('pembatas tanpa atribut kolom berarti satu kolom, bukan meneruskan', () => {
		const doc = docWith({ columns: { count: 2 } }, {})
		const spans = sectionSpans(doc, DEFAULT_PAGE_SETUP)

		expect(spans[1].columns).toEqual({ count: 2 })
		expect(spans[2].columns).toBeNull()
	})

	test('setelan halaman tetap diwarisi walau kolomnya tidak', () => {
		// Dua sifat yang berbeda pada node yang sama - gampang tertukar saat
		// menyunting `sectionSpans`, dan akibatnya baru kelihatan di halaman ketiga.
		const doc = docWith({ pageSetup: { orientation: 'landscape' }, columns: { count: 2 } }, {})
		const spans = sectionSpans(doc, DEFAULT_PAGE_SETUP)

		expect(spans[2].setup.orientation).toBe('landscape')
		expect(spans[2].columns).toBeNull()
	})
})
