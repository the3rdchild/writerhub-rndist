import { describe, expect, test } from 'bun:test'
import * as Y from 'yjs'
import {
	createTab,
	deleteTab,
	duplicateTab,
	moveTab,
	readTabs,
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

describe('struktur tab di Y.Doc', () => {
	test('tab baru masuk ke urutan beserta metanya', () => {
		const doc = new Y.Doc()
		const first = createTab(doc, 'Bab satu')
		const second = createTab(doc)

		expect(readTabs(doc).map((tab) => tab.id)).toEqual([first, second])
		expect(readTabs(doc)[0].title).toBe('Bab satu')
		expect(readTabs(doc)[1].title).toBe('Untitled document')
	})

	/**
	 * Arah pindah harus cocok dengan penanda yang ditampilkan sidebar: ke bawah
	 * berarti mendarat sesudah tab tujuan, ke atas berarti sebelumnya.
	 */
	test('pindah ke bawah mendarat sesudah tab tujuan', () => {
		const doc = new Y.Doc()
		const a = createTab(doc, 'A')
		const b = createTab(doc, 'B')
		const c = createTab(doc, 'C')

		moveTab(doc, a, c)
		expect(readTabs(doc).map((tab) => tab.title)).toEqual(['B', 'C', 'A'])
	})

	test('pindah ke atas mendarat sebelum tab tujuan', () => {
		const doc = new Y.Doc()
		const a = createTab(doc, 'A')
		createTab(doc, 'B')
		const c = createTab(doc, 'C')

		moveTab(doc, c, a)
		expect(readTabs(doc).map((tab) => tab.title)).toEqual(['C', 'A', 'B'])
	})

	test('naik satu langkah menukar dengan tetangga di atasnya', () => {
		const doc = new Y.Doc()
		const a = createTab(doc, 'A')
		const b = createTab(doc, 'B')

		moveTab(doc, b, a)
		expect(readTabs(doc).map((tab) => tab.title)).toEqual(['B', 'A'])
	})

	test('menghapus tab membuang meta, urutan, dan naskahnya', () => {
		const doc = new Y.Doc()
		const a = createTab(doc, 'A')
		const b = createTab(doc, 'B')
		writeParagraph(doc, a, 'isi yang akan hilang')

		deleteTab(doc, a)

		expect(readTabs(doc).map((tab) => tab.id)).toEqual([b])
		expect(tabFragment(doc, a).length).toBe(0)
	})

	/** Id yatim di urutan tidak boleh muncul sebagai tab tanpa nama. */
	test('urutan yang menyebut tab tak bermeta diabaikan', () => {
		const doc = new Y.Doc()
		const a = createTab(doc, 'A')
		tabsRoot(doc).order.insert(1, ['tab-hantu'])

		expect(readTabs(doc).map((tab) => tab.id)).toEqual([a])
	})
})

describe('duplikat tab', () => {
	test('salinan berisi naskah yang sama dan duduk tepat setelah aslinya', () => {
		const doc = new Y.Doc()
		const a = createTab(doc, 'Asli')
		createTab(doc, 'Lain')
		writeParagraph(doc, a, 'naskah asli')

		const copy = duplicateTab(doc, a)
		expect(copy).not.toBeNull()

		const titles = readTabs(doc).map((tab) => tab.title)
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
		const a = createTab(doc, 'Asli')
		updateTab(doc, a, {
			comments: [{ id: 'c1', quote: 'kutipan', replies: [], resolved: false, createdAt: 1 }],
		})

		const copy = duplicateTab(doc, a) as string
		expect(readTabs(doc).find((tab) => tab.id === copy)?.comments).toEqual([])
		expect(readTabs(doc).find((tab) => tab.id === a)?.comments).toHaveLength(1)
	})
})

describe('pratinjau naskah', () => {
	test('mengambil teks tanpa penanda format', () => {
		const doc = new Y.Doc()
		const id = createTab(doc)

		const paragraph = new Y.XmlElement('paragraph')
		const text = new Y.XmlText('judul tebal')
		text.format(0, 5, { strong: {} })
		paragraph.insert(0, [text])
		tabFragment(doc, id).insert(0, [paragraph])

		expect(tabPreview(doc, id)).toBe('judul tebal')
	})

	test('dua paragraf tidak menyatu jadi satu kata', () => {
		const doc = new Y.Doc()
		const id = createTab(doc)
		writeParagraph(doc, id, 'baris satu')
		const second = new Y.XmlElement('paragraph')
		second.insert(0, [new Y.XmlText('baris dua')])
		tabFragment(doc, id).insert(1, [second])

		expect(tabPreview(doc, id)).toBe('baris satu baris dua')
	})

	test('dipotong pada batas yang diminta', () => {
		const doc = new Y.Doc()
		const id = createTab(doc)
		writeParagraph(doc, id, 'satu dua tiga empat lima enam tujuh delapan')

		expect(tabPreview(doc, id, 8).length).toBeLessThanOrEqual(8)
	})
})
