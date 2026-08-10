import { describe, expect, test } from 'bun:test'
import * as Y from 'yjs'
import {
	createDocument,
	createTab,
	deleteDocument,
	deleteTab,
	docsRoot,
	duplicateTab,
	findTabDoc,
	moveDocument,
	moveTab,
	readDocs,
	readTabs,
	renameDocument,
	tabFragment,
	tabPreview,
	tabsRoot,
	updateTab,
} from './ydoc'

/** Isi satu tab dengan satu paragraf berteks, tanpa lewat TipTap. */
function writeParagraph(doc: Y.Doc, id: string, text: string): void {
	const paragraph = new Y.XmlElement('paragraph')
	paragraph.insert(0, [new Y.XmlText(text)])
	tabFragment(doc, id).insert(0, [paragraph])
}

/**
 * Dokumen baru berisi tab-tab berjudul sesuai `titles`. Tab pertama memakai
 * tab bawaan `createDocument`, supaya tidak ada tab penggangguran.
 */
function docWithTabs(doc: Y.Doc, titles: string[]): { docId: string; tabIds: string[] } {
	const docId = createDocument(doc)
	const first = readTabs(doc, docId)[0].id
	updateTab(doc, first, { title: titles[0] })
	const tabIds = [first, ...titles.slice(1).map((title) => createTab(doc, docId, title))]
	return { docId, tabIds }
}

describe('struktur dokumen di Y.Doc', () => {
	test('dokumen baru langsung berisi satu tab berjudul sama', () => {
		const doc = new Y.Doc()
		const docId = createDocument(doc, 'Bab Pembahasan')

		const docs = readDocs(doc)
		expect(docs.map((dok) => dok.id)).toEqual([docId])
		expect(docs[0].title).toBe('Bab Pembahasan')

		const tabs = readTabs(doc, docId)
		expect(tabs).toHaveLength(1)
		expect(tabs[0].title).toBe('Bab Pembahasan')
		expect(docs[0].tabOrder).toEqual([tabs[0].id])
	})

	test('ganti nama dan pindah posisi dokumen', () => {
		const doc = new Y.Doc()
		const satu = createDocument(doc, 'Satu')
		const dua = createDocument(doc, 'Dua')
		const tiga = createDocument(doc, 'Tiga')

		renameDocument(doc, dua, 'Dua (revisi)')
		expect(readDocs(doc).find((dok) => dok.id === dua)?.title).toBe('Dua (revisi)')

		moveDocument(doc, tiga, satu)
		expect(readDocs(doc).map((dok) => dok.title)).toEqual(['Tiga', 'Satu', 'Dua (revisi)'])
	})

	test('menghapus dokumen membuang seluruh tab dan naskahnya', () => {
		const doc = new Y.Doc()
		const { docId, tabIds } = docWithTabs(doc, ['Pertama', 'Kedua'])
		writeParagraph(doc, tabIds[0], 'isi yang akan hilang')
		writeParagraph(doc, tabIds[1], 'isi kedua')

		deleteDocument(doc, docId)

		expect(readDocs(doc)).toEqual([])
		expect(readTabs(doc)).toEqual([])
		expect(tabFragment(doc, tabIds[0]).length).toBe(0)
		expect(tabFragment(doc, tabIds[1]).length).toBe(0)
	})

	test('menghapus dokumen tidak menyentuh dokumen lain', () => {
		const doc = new Y.Doc()
		const { docId, tabIds } = docWithTabs(doc, ['Milik pertama'])
		const lain = docWithTabs(doc, ['Milik kedua'])
		writeParagraph(doc, lain.tabIds[0], 'naskah tetangga')

		deleteDocument(doc, docId)

		expect(readDocs(doc).map((dok) => dok.id)).toEqual([lain.docId])
		expect(readTabs(doc).map((tab) => tab.id)).toEqual(lain.tabIds)
		expect(tabPreview(doc, lain.tabIds[0])).toBe('naskah tetangga')
		expect(tabIds.every((id) => readTabs(doc).every((tab) => tab.id !== id))).toBe(true)
	})
})

describe('tab di dalam dokumen', () => {
	test('tab baru masuk ke urutan dokumennya beserta metanya', () => {
		const doc = new Y.Doc()
		const docId = createDocument(doc)
		const first = readTabs(doc, docId)[0].id
		const second = createTab(doc, docId, 'Bab satu')

		expect(readTabs(doc, docId).map((tab) => tab.id)).toEqual([first, second])
		expect(readTabs(doc, docId)[1].title).toBe('Bab satu')
	})

	test('readTabs tanpa dokumen membaca semua tab lintas dokumen', () => {
		const doc = new Y.Doc()
		const pertama = docWithTabs(doc, ['A', 'B'])
		const kedua = docWithTabs(doc, ['C'])

		expect(readTabs(doc).map((tab) => tab.title)).toEqual(['A', 'B', 'C'])
		expect(readTabs(doc, kedua.docId).map((tab) => tab.id)).toEqual(kedua.tabIds)
		expect(pertama.tabIds.every((id) => findTabDoc(doc, id) === pertama.docId)).toBe(true)
	})

	test('membuat tab di dokumen yang tidak ada ditolak', () => {
		const doc = new Y.Doc()
		expect(() => createTab(doc, 'dokumen-hantu')).toThrow()
	})

	/**
	 * Arah pindah harus cocok dengan penanda yang ditampilkan sidebar: ke bawah
	 * berarti mendarat sesudah tab tujuan, ke atas berarti sebelumnya.
	 */
	test('pindah ke bawah mendarat sesudah tab tujuan', () => {
		const doc = new Y.Doc()
		const { tabIds } = docWithTabs(doc, ['A', 'B', 'C'])

		moveTab(doc, tabIds[0], tabIds[2])
		expect(readTabs(doc).map((tab) => tab.title)).toEqual(['B', 'C', 'A'])
	})

	test('pindah ke atas mendarat sebelum tab tujuan', () => {
		const doc = new Y.Doc()
		const { tabIds } = docWithTabs(doc, ['A', 'B', 'C'])

		moveTab(doc, tabIds[2], tabIds[0])
		expect(readTabs(doc).map((tab) => tab.title)).toEqual(['C', 'A', 'B'])
	})

	test('pindah antar dokumen diabaikan', () => {
		const doc = new Y.Doc()
		const pertama = docWithTabs(doc, ['A', 'B'])
		const kedua = docWithTabs(doc, ['C'])

		moveTab(doc, pertama.tabIds[0], kedua.tabIds[0])

		expect(readTabs(doc, pertama.docId).map((tab) => tab.title)).toEqual(['A', 'B'])
		expect(readTabs(doc, kedua.docId).map((tab) => tab.title)).toEqual(['C'])
	})

	test('menghapus tab membuang meta, urutan, dan naskahnya', () => {
		const doc = new Y.Doc()
		const { docId, tabIds } = docWithTabs(doc, ['A', 'B'])
		writeParagraph(doc, tabIds[0], 'isi yang akan hilang')

		deleteTab(doc, tabIds[0])

		expect(readTabs(doc, docId).map((tab) => tab.id)).toEqual([tabIds[1]])
		expect(tabFragment(doc, tabIds[0]).length).toBe(0)
		// Dokumennya tetap ada karena masih punya tab.
		expect(readDocs(doc).map((dok) => dok.id)).toEqual([docId])
	})

	test('menghapus tab terakhir sekaligus menghapus dokumennya', () => {
		const doc = new Y.Doc()
		const { docId, tabIds } = docWithTabs(doc, ['Satu-satunya'])
		writeParagraph(doc, tabIds[0], 'isi yang akan hilang')

		deleteTab(doc, tabIds[0])

		expect(readDocs(doc)).toEqual([])
		expect(readTabs(doc)).toEqual([])
		expect(tabFragment(doc, tabIds[0]).length).toBe(0)
	})

	/** Id yatim di urutan tidak boleh muncul sebagai tab tanpa nama. */
	test('urutan yang menyebut tab tak bermeta diabaikan', () => {
		const doc = new Y.Doc()
		const { docId, tabIds } = docWithTabs(doc, ['A'])
		const tabOrder = docsRoot(doc).meta.get(docId)?.get('tabOrder') as Y.Array<string>
		tabOrder.insert(1, ['tab-hantu'])

		expect(readTabs(doc, docId).map((tab) => tab.id)).toEqual(tabIds)
	})

	/** Tab tanpa dokumen tetap terbaca, supaya naskahnya tidak hilang diam-diam. */
	test('tab yatim ikut dibaca di ujung daftar', () => {
		const doc = new Y.Doc()
		docWithTabs(doc, ['Punya dokumen'])
		const entry = new Y.Map<unknown>()
		entry.set('title', 'Yatim')
		tabsRoot(doc).meta.set('tab-yatim', entry)

		expect(readTabs(doc).map((tab) => tab.title)).toEqual(['Punya dokumen', 'Yatim'])
	})
})

describe('duplikat tab', () => {
	test('salinan berisi naskah yang sama dan duduk tepat setelah aslinya', () => {
		const doc = new Y.Doc()
		const { docId, tabIds } = docWithTabs(doc, ['Asli', 'Lain'])
		writeParagraph(doc, tabIds[0], 'naskah asli')

		const copy = duplicateTab(doc, tabIds[0])
		expect(copy).not.toBeNull()

		const titles = readTabs(doc, docId).map((tab) => tab.title)
		expect(titles).toEqual(['Asli', 'Asli (salinan)', 'Lain'])
		expect(tabPreview(doc, copy as string)).toBe('naskah asli')
	})

	/**
	 * Komentar berjangkar pada mark bernama sama di dalam naskah. Kalau ikut
	 * tersalin, satu utas akan muncul di dua naskah sekaligus dan membalasnya di
	 * satu tempat mengubah yang lain.
	 */
	test('komentar tidak ikut tersalin', () => {
		const doc = new Y.Doc()
		const { docId, tabIds } = docWithTabs(doc, ['Asli'])
		updateTab(doc, tabIds[0], {
			comments: [{ id: 'c1', quote: 'kutipan', replies: [], resolved: false, createdAt: 1 }],
		})

		const copy = duplicateTab(doc, tabIds[0]) as string
		expect(readTabs(doc, docId).find((tab) => tab.id === copy)?.comments).toEqual([])
		expect(readTabs(doc, docId).find((tab) => tab.id === tabIds[0])?.comments).toHaveLength(1)
	})
})

describe('pratinjau naskah', () => {
	test('mengambil teks tanpa penanda format', () => {
		const doc = new Y.Doc()
		const id = createTab(doc, createDocument(doc))

		const paragraph = new Y.XmlElement('paragraph')
		const text = new Y.XmlText('judul tebal')
		text.format(0, 5, { strong: {} })
		paragraph.insert(0, [text])
		tabFragment(doc, id).insert(0, [paragraph])

		expect(tabPreview(doc, id)).toBe('judul tebal')
	})

	test('dua paragraf tidak menyatu jadi satu kata', () => {
		const doc = new Y.Doc()
		const id = createTab(doc, createDocument(doc))
		writeParagraph(doc, id, 'baris satu')
		const second = new Y.XmlElement('paragraph')
		second.insert(0, [new Y.XmlText('baris dua')])
		tabFragment(doc, id).insert(1, [second])

		expect(tabPreview(doc, id)).toBe('baris satu baris dua')
	})

	test('dipotong pada batas yang diminta', () => {
		const doc = new Y.Doc()
		const id = createTab(doc, createDocument(doc))
		writeParagraph(doc, id, 'satu dua tiga empat lima enam tujuh delapan')

		expect(tabPreview(doc, id, 8).length).toBeLessThanOrEqual(8)
	})
})
