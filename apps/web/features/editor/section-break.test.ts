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