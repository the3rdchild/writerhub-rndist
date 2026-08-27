import { describe, expect, test } from 'bun:test'
import { Schema } from '@tiptap/pm/model'
import { EditorState, TextSelection } from '@tiptap/pm/state'
import { DEFAULT_PAGE_SETUP, INCH } from './page-geometry'
import {
	columnRegions,
	sectionSpans,
	setSectionColumnsCommand,
	unsetSectionColumnsCommand,
} from './section-break'

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
				continuous: { default: false },
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
		expect(spans[1].setup.margins).toEqual(DEFAULT_PAGE_SETUP.margins)
	})

	test('perubahan menumpuk: section ketiga mewarisi section kedua, bukan dasar', () => {
		const spans = sectionSpans(
			docWith({ pageSetup: { orientation: 'landscape' } }, { pageSetup: { margins: { top: INCH / 2 } } }),
		)

		expect(spans).toHaveLength(3)
		expect(spans[2].setup.orientation).toBe('landscape')
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
		expect(regions[0].from).toBe(3)
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
	test('section sesudah rentang kembali persis ke setelan dasar', () => {
		const doc = docWith(
			{ pageSetup: { orientation: 'landscape', size: 'a3' } },
			{ pageSetup: { ...DEFAULT_PAGE_SETUP } },
		)
		const spans = sectionSpans(doc, DEFAULT_PAGE_SETUP)

		expect(spans).toHaveLength(3)
		expect(spans[1].setup).toMatchObject({ orientation: 'landscape', size: 'a3' })
		expect(spans[2].setup).toEqual(DEFAULT_PAGE_SETUP)
	})

	test('selisih saja tidak cukup - inilah alasan penutup membawa semuanya', () => {
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
		const doc = docWith({ pageSetup: { margins: narrow } }, { pageSetup: { ...DEFAULT_PAGE_SETUP } })
		const spans = sectionSpans(doc, DEFAULT_PAGE_SETUP)

		expect(spans[1].setup.margins.left).toBe(INCH / 2)
		expect(spans[2].setup.margins).toEqual(DEFAULT_PAGE_SETUP.margins)
	})
})

describe('kolom section tidak diwarisi (§P8)', () => {
	test('pembatas tanpa atribut kolom berarti satu kolom, bukan meneruskan', () => {
		const doc = docWith({ columns: { count: 2 } }, {})
		const spans = sectionSpans(doc, DEFAULT_PAGE_SETUP)

		expect(spans[1].columns).toEqual({ count: 2 })
		expect(spans[2].columns).toBeNull()
	})

	test('setelan halaman tetap diwarisi walau kolomnya tidak', () => {
		const doc = docWith({ pageSetup: { orientation: 'landscape' }, columns: { count: 2 } }, {})
		const spans = sectionSpans(doc, DEFAULT_PAGE_SETUP)

		expect(spans[2].setup.orientation).toBe('landscape')
		expect(spans[2].columns).toBeNull()
	})
})

describe('setSectionColumns - kolomkan seleksi sebagai section menerus (E5)', () => {
	function stateOf(texts: string[], from: number, to = from): EditorState {
		const doc = schema.node(
			'doc',
			null,
			texts.map((text) => schema.node('paragraph', null, text ? [schema.text(text)] : [])),
		)
		const state = EditorState.create({ schema, doc })
		return state.apply(state.tr.setSelection(TextSelection.create(state.doc, from, to)))
	}

	function run(state: EditorState, count: number): EditorState {
		const tr = state.tr
		const ok = setSectionColumnsCommand(state, tr, () => {}, count)
		expect(ok).toBe(true)
		return state.apply(tr)
	}

	test('sepasang pembatas menerus mengurung blok yang tersentuh seleksi', () => {
		const next = run(stateOf(['satu', 'dua', 'tiga'], 1, 7), 2)

		expect(next.doc.childCount).toBe(5)
		const open = next.doc.child(0)
		expect(open.type.name).toBe('sectionBreak')
		expect(open.attrs).toMatchObject({ columns: { count: 2 }, continuous: true, pageSetup: null })
		const close = next.doc.child(3)
		expect(close.type.name).toBe('sectionBreak')
		expect(close.attrs).toMatchObject({ columns: null, continuous: true })
		expect(next.doc.child(1).textContent).toBe('satu')
		expect(next.doc.child(2).textContent).toBe('dua')
		expect(next.doc.child(4).textContent).toBe('tiga')
	})

	test('seleksi lipat mengolomkan paragraf tempat kursor berada', () => {
		const next = run(stateOf(['satu', 'dua', 'tiga'], 7), 2)

		expect(next.doc.childCount).toBe(5)
		expect(next.doc.child(0).textContent).toBe('satu')
		expect(next.doc.child(1).type.name).toBe('sectionBreak')
		expect(next.doc.child(2).textContent).toBe('dua')
		expect(next.doc.child(3).type.name).toBe('sectionBreak')
		expect(next.doc.child(4).textContent).toBe('tiga')
	})

	test('di dalam rentang berkolom: cukup mengganti jumlahnya, tanpa pembatas baru', () => {
		const columned = run(stateOf(['satu', 'dua', 'tiga'], 1, 7), 2)
		const next = run(columned, 3)

		expect(next.doc.childCount).toBe(5) // tidak bertambah
		expect(next.doc.child(0).attrs.columns).toEqual({ count: 3 })
	})

	test('rentang sampai ujung dokumen tidak butuh pembatas penutup', () => {
		const next = run(stateOf(['satu', 'dua'], 1, 7), 2)

		expect(next.doc.childCount).toBe(3)
		expect(next.doc.child(0).type.name).toBe('sectionBreak')
		expect(next.doc.child(2).textContent).toBe('dua')
	})
})

describe('unsetSectionColumns - hapus sepasang pembatas berkolom (E5)', () => {
	function columnedDoc(): EditorState {
		const doc = schema.node('doc', null, [
			schema.node('paragraph', null, [schema.text('satu')]),
			schema.node('sectionBreak', { pageSetup: null, columns: { count: 2 }, continuous: true }),
			schema.node('paragraph', null, [schema.text('dua')]),
			schema.node('sectionBreak', { pageSetup: null, columns: null, continuous: true }),
			schema.node('paragraph', null, [schema.text('tiga')]),
		])
		return EditorState.create({ schema, doc })
	}

	test('kedua pembatas terhapus dan isinya kembali satu kolom', () => {
		const state = columnedDoc()
		const selected = state.apply(state.tr.setSelection(TextSelection.create(state.doc, 9)))
		const tr = selected.tr
		const ok = unsetSectionColumnsCommand(selected, tr, () => {})
		const next = selected.apply(tr)

		expect(ok).toBe(true)
		expect(next.doc.childCount).toBe(3)
		expect(next.doc.textContent).toBe('satuduatiga')
	})

	test('di luar rentang berkolom tidak melakukan apa-apa', () => {
		const state = columnedDoc()
		const selected = state.apply(state.tr.setSelection(TextSelection.create(state.doc, 1)))
		expect(unsetSectionColumnsCommand(selected, selected.tr, undefined)).toBe(false)
	})
})
