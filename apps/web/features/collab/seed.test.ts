import { describe, expect, test } from 'bun:test'
import { COLLAB_FRAGMENT } from '@writer-hub/shared'
import { yXmlFragmentToProseMirrorRootNode } from 'y-prosemirror'
import * as Y from 'yjs'
import { buildSchema, jsonToFragment } from '@/features/sync/serialize'
import { RICH_DOCUMENT } from './fixtures'
import { seedUpdateFromFragment, seedUpdateFromJSON } from './seed'

const schema = buildSchema()

function contentOf(update: Uint8Array) {
	const doc = new Y.Doc()
	Y.applyUpdate(doc, update)
	return yXmlFragmentToProseMirrorRootNode(doc.getXmlFragment(COLLAB_FRAGMENT), schema).toJSON()
}

describe('isi awal (semaian)', () => {
	test('dari JSON server: isinya utuh di fragmen kolaborasi', () => {
		expect(contentOf(seedUpdateFromJSON(RICH_DOCUMENT, schema))).toEqual(
			schema.nodeFromJSON(RICH_DOCUMENT).toJSON(),
		)
	})

	test('dari JSON kosong: satu paragraf kosong, seperti editor baru', () => {
		expect(contentOf(seedUpdateFromJSON({ type: 'doc', content: [] }, schema))).toEqual({
			type: 'doc',
			content: [{ type: 'paragraph', attrs: expect.any(Object) }],
		})
	})

	test('dari fragmen lokal: salinan persis, dan terlepas dari sumbernya', () => {
		const local = new Y.Doc()
		jsonToFragment(local, 'tab-lokal', RICH_DOCUMENT)
		const update = seedUpdateFromFragment(local.getXmlFragment('tab-lokal'))
		const before = contentOf(update)
		expect(before).toEqual(schema.nodeFromJSON(RICH_DOCUMENT).toJSON())

		// Sumbernya berubah setelah semaian dibuat: semaiannya tidak ikut.
		local.getXmlFragment('tab-lokal').delete(0, 1)
		expect(contentOf(update)).toEqual(before)
	})

	test('semaian berdiri sendiri: tidak ada struktur yang menggantung', () => {
		const doc = new Y.Doc()
		Y.applyUpdate(doc, seedUpdateFromJSON(RICH_DOCUMENT, schema))
		expect(doc.store.pendingStructs).toBeNull()
		expect(doc.store.pendingDs).toBeNull()
	})
})
