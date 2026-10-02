import { describe, expect, test } from 'bun:test'
import { COLLAB_FRAGMENT } from '@writer-hub/shared'
import * as Y from 'yjs'
import { buildSchema, fragmentToJSON } from '@/features/sync/serialize'
import { RICH_DOCUMENT } from './fixtures'
import { COLLAB_MIRROR_ORIGIN, createFragmentMirror, mirrorFragment } from './mirror'
import { seedUpdateFromJSON } from './seed'

const schema = buildSchema()

function collabDoc(): Y.Doc {
	const doc = new Y.Doc()
	Y.applyUpdate(doc, seedUpdateFromJSON(RICH_DOCUMENT, schema))
	return doc
}

function appendParagraph(doc: Y.Doc, text: string): void {
	const fragment = doc.getXmlFragment(COLLAB_FRAGMENT)
	const paragraph = new Y.XmlElement('paragraph')
	paragraph.insert(0, [new Y.XmlText(text)])
	fragment.insert(fragment.length, [paragraph])
}

describe('cermin tab kolaboratif ke Y.Doc besar', () => {
	test('isi fragmen tab lokal sama dengan Y.Doc kolaborasi', () => {
		const source = collabDoc()
		const target = new Y.Doc()
		expect(mirrorFragment(source.getXmlFragment(COLLAB_FRAGMENT), target, 'tab-1', schema)).toBe(true)
		expect(fragmentToJSON(target, 'tab-1')).toEqual(schema.nodeFromJSON(RICH_DOCUMENT).toJSON())
	})

	test('suntingan berikutnya disalin sebagai diff kecil, dengan asal transaksi cermin', () => {
		const source = collabDoc()
		const target = new Y.Doc()
		mirrorFragment(source.getXmlFragment(COLLAB_FRAGMENT), target, 'tab-1', schema)
		const full = Y.encodeStateAsUpdate(target).byteLength

		const updates: Array<{ size: number; origin: unknown }> = []
		target.on('update', (update: Uint8Array, origin: unknown) =>
			updates.push({ size: update.byteLength, origin }),
		)
		appendParagraph(source, 'kalimat tambahan')
		mirrorFragment(source.getXmlFragment(COLLAB_FRAGMENT), target, 'tab-1', schema)

		expect(updates).toHaveLength(1)
		expect(updates[0].origin).toBe(COLLAB_MIRROR_ORIGIN)
		expect(updates[0].size).toBeLessThan(full / 4)
		expect(JSON.stringify(fragmentToJSON(target, 'tab-1'))).toContain('kalimat tambahan')
	})

	test('tanpa perubahan, cermin tidak menulis apa pun (tidak ada gema)', () => {
		const source = collabDoc()
		const target = new Y.Doc()
		mirrorFragment(source.getXmlFragment(COLLAB_FRAGMENT), target, 'tab-1', schema)
		let writes = 0
		target.on('update', () => {
			writes += 1
		})
		mirrorFragment(source.getXmlFragment(COLLAB_FRAGMENT), target, 'tab-1', schema)
		expect(writes).toBe(0)
	})

	test('naskah yang tidak sah dilewati tanpa menyentuh sumbernya', () => {
		const source = new Y.Doc()
		source.getXmlFragment(COLLAB_FRAGMENT).insert(0, [new Y.XmlElement('simpulTakDikenal')])
		const before = Y.encodeStateAsUpdate(source)
		const target = new Y.Doc()
		expect(mirrorFragment(source.getXmlFragment(COLLAB_FRAGMENT), target, 'tab-1', schema)).toBe(false)
		expect(Y.encodeStateAsUpdate(source)).toEqual(before)
	})

	test('cermin tertunda: menunggu jeda tenang, bisa dipaksa, dan berhenti setelah dilepas', async () => {
		const source = collabDoc()
		const target = new Y.Doc()
		const mirror = createFragmentMirror({
			source,
			target,
			targetField: 'tab-1',
			schema,
			delayMs: 20,
			maxDelayMs: 200,
		})

		appendParagraph(source, 'tertunda')
		expect(JSON.stringify(fragmentToJSON(target, 'tab-1'))).not.toContain('tertunda')
		await Bun.sleep(60)
		expect(JSON.stringify(fragmentToJSON(target, 'tab-1'))).toContain('tertunda')

		appendParagraph(source, 'dipaksa')
		mirror.flush()
		expect(JSON.stringify(fragmentToJSON(target, 'tab-1'))).toContain('dipaksa')

		mirror.destroy()
		appendParagraph(source, 'setelah-lepas')
		await Bun.sleep(60)
		expect(JSON.stringify(fragmentToJSON(target, 'tab-1'))).not.toContain('setelah-lepas')
	})
})
