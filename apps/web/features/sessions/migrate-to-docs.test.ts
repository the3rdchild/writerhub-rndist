import { describe, expect, test } from 'bun:test'
import * as Y from 'yjs'
import { migrateTabsToDocs } from './migrate-to-docs'
import {
	createDocument,
	docsRoot,
	legacyTabOrder,
	readDocs,
	readTabs,
	tabFragment,
	tabPreview,
	tabsRoot,
} from './ydoc'

/**
 * Bangun struktur lama (sebelum dokumen ada): urutan tab global di
 * Y.Map('tabs')['order'], meta per tab, dan naskah di fragmen bernama id tab.
 */
function legacyTab(doc: Y.Doc, id: string, title: string, text?: string): void {
	const root = doc.getMap<unknown>('tabs')
	let order = root.get('order') as Y.Array<string> | undefined
	if (!order) {
		order = new Y.Array<string>()
		root.set('order', order)
	}
	order.push([id])

	const entry = new Y.Map<unknown>()
	entry.set('title', title)
	entry.set('emoji', null)
	entry.set('language', null)
	entry.set('comments', [])
	entry.set('updatedAt', 42)
	tabsRoot(doc).meta.set(id, entry)

	if (text) {
		const paragraph = new Y.XmlElement('paragraph')
		paragraph.insert(0, [new Y.XmlText(text)])
		tabFragment(doc, id).insert(0, [paragraph])
	}
}

describe('migrasi struktur tab lama ke dokumen', () => {
	test('tiap tab lama jadi dokumen berisi satu tab, judul disalin', () => {
		const doc = new Y.Doc()
		legacyTab(doc, 'tab-a', 'Bab satu', 'naskah bab satu')
		legacyTab(doc, 'tab-b', 'Bab dua', 'naskah bab dua')

		expect(migrateTabsToDocs(doc)).toBe(true)

		const docs = readDocs(doc)
		expect(docs).toHaveLength(2)
		expect(docs.map((dok) => dok.title)).toEqual(['Bab satu', 'Bab dua'])
		expect(docs[0].tabOrder).toEqual(['tab-a'])
		expect(docs[1].tabOrder).toEqual(['tab-b'])
		// Waktu sunting tab ikut naik ke dokumennya.
		expect(docs[0].updatedAt).toBe(42)

		// Urutan baca lintas dokumen sama dengan urutan lama.
		expect(readTabs(doc).map((tab) => tab.id)).toEqual(['tab-a', 'tab-b'])
	})

	test('naskah di fragmen tidak disentuh sama sekali', () => {
		const doc = new Y.Doc()
		legacyTab(doc, 'tab-a', 'Bab satu', 'naskah yang harus utuh')

		migrateTabsToDocs(doc)

		expect(tabPreview(doc, 'tab-a')).toBe('naskah yang harus utuh')
	})

	test('struktur lama dibersihkan setelah yang baru terbaca', () => {
		const doc = new Y.Doc()
		legacyTab(doc, 'tab-a', 'Bab satu')

		migrateTabsToDocs(doc)

		expect(legacyTabOrder(doc)).toBeUndefined()
		expect(readDocs(doc).some((dok) => dok.tabOrder.includes('tab-a'))).toBe(true)
	})

	test('idempoten: dijalankan dua kali tidak menggandakan apa pun', () => {
		const doc = new Y.Doc()
		legacyTab(doc, 'tab-a', 'Bab satu', 'naskah')
		legacyTab(doc, 'tab-b', 'Bab dua')

		migrateTabsToDocs(doc)
		const sesudah = readDocs(doc).map((dok) => ({ title: dok.title, tabOrder: dok.tabOrder }))

		expect(migrateTabsToDocs(doc)).toBe(false)
		expect(readDocs(doc).map((dok) => ({ title: dok.title, tabOrder: dok.tabOrder }))).toEqual(
			sesudah,
		)
		expect(readTabs(doc)).toHaveLength(2)
	})

	test('tab yang sudah terdaftar di dokumen tidak diangkat ulang', () => {
		const doc = new Y.Doc()
		legacyTab(doc, 'tab-a', 'Bab satu')
		legacyTab(doc, 'tab-b', 'Bab dua')

		// Seolah migrasi sebelumnya terputus di tengah: tab-a sudah punya
		// dokumen, tab-b belum, dan kunci lama masih ada.
		const docId = createDocument(doc, 'Sudah jadi dokumen')
		const entry = docsRoot(doc).meta.get(docId)
		const tabOrder = entry?.get('tabOrder') as Y.Array<string>
		tabOrder.delete(0, tabOrder.length)
		tabOrder.push(['tab-a'])

		expect(migrateTabsToDocs(doc)).toBe(true)

		const docs = readDocs(doc)
		expect(docs).toHaveLength(2)
		// Dokumen tab-a yang sudah ada dibiarkan apa adanya.
		expect(docs[0].id).toBe(docId)
		expect(docs[0].tabOrder).toEqual(['tab-a'])
		expect(docs[1].tabOrder).toEqual(['tab-b'])
		expect(legacyTabOrder(doc)).toBeUndefined()
	})

	test('id hantu di urutan lama diabaikan, sisanya tetap bermigrasi', () => {
		const doc = new Y.Doc()
		legacyTab(doc, 'tab-a', 'Bab satu')
		// Id tanpa meta - tidak pernah ada tabnya.
		;(legacyTabOrder(doc) as Y.Array<string>).push(['tab-hantu'])

		migrateTabsToDocs(doc)

		expect(readDocs(doc)).toHaveLength(1)
		expect(readTabs(doc).map((tab) => tab.id)).toEqual(['tab-a'])
		expect(legacyTabOrder(doc)).toBeUndefined()
	})

	test('tanpa struktur lama tidak ada yang dikerjakan', () => {
		const doc = new Y.Doc()
		createDocument(doc, 'Struktur baru')

		expect(migrateTabsToDocs(doc)).toBe(false)
		expect(readDocs(doc)).toHaveLength(1)
	})
})
