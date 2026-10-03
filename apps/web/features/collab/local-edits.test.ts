import { describe, expect, test } from 'bun:test'
import * as Y from 'yjs'
import { createLocalEdits, touchesTab } from './local-edits'

function memoryStorage(): Pick<Storage, 'getItem' | 'setItem'> {
	const values = new Map<string, string>()
	return {
		getItem: (key) => values.get(key) ?? null,
		setItem: (key, value) => {
			values.set(key, value)
		},
	}
}

describe('suntingan di salinan lokal tab cloud', () => {
	test('tanda bertahan setelah muat ulang dan bisa dibersihkan', () => {
		const storage = memoryStorage()
		const first = createLocalEdits(storage)
		let notified = 0
		first.subscribe(() => {
			notified += 1
		})
		const before = first.snapshot()
		first.mark('tab-a')
		const after = first.snapshot()
		first.mark('tab-a')
		expect(first.has('tab-a')).toBe(true)
		expect(first.lastEditAt('tab-a')).toBeGreaterThan(0)
		expect(notified).toBe(1)
		// Rujukan potret hanya berganti saat isinya berubah.
		expect(after).not.toBe(before)
		expect(first.snapshot()).toBe(after)
		expect([...after]).toEqual(['tab-a'])

		const reloaded = createLocalEdits(storage)
		expect(reloaded.has('tab-a')).toBe(true)
		// Waktu suntingan hanya milik halaman yang melihatnya.
		expect(reloaded.lastEditAt('tab-a')).toBe(0)
		reloaded.clear('tab-a')
		expect(createLocalEdits(storage).has('tab-a')).toBe(false)
	})

	test('penyimpanan yang rusak atau tidak ada tidak menggagalkan apa pun', () => {
		const broken = memoryStorage()
		broken.setItem('writer-hub-collab-local-edits', '{bukan json')
		expect(createLocalEdits(broken).has('x')).toBe(false)
		const none = createLocalEdits(null)
		none.mark('x')
		expect(none.has('x')).toBe(true)
	})

	test('hanya perubahan di fragmen tab itu - di kedalaman mana pun - yang dihitung', () => {
		const doc = new Y.Doc()
		const tabA = doc.getXmlFragment('tab-a')
		doc.getXmlFragment('tab-b')
		const seen: Array<[boolean, boolean]> = []
		doc.on('afterTransaction', (transaction: Y.Transaction) => {
			seen.push([touchesTab(transaction, doc, 'tab-a'), touchesTab(transaction, doc, 'tab-b')])
			// Tab yang fragmennya belum pernah ada tidak pernah tersentuh.
			expect(touchesTab(transaction, doc, 'tab-c')).toBe(false)
		})

		const paragraph = new Y.XmlElement('paragraph')
		tabA.insert(0, [paragraph])
		const text = new Y.XmlText()
		paragraph.insert(0, [text])
		text.insert(0, 'halo')
		doc.getMap('meta').set('judul', 'Judul')

		expect(seen).toEqual([
			[true, false],
			[true, false],
			[true, false],
			[false, false],
		])
	})
})
