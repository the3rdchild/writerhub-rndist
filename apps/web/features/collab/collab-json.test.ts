import { describe, expect, test } from 'bun:test'
import { COLLAB_FRAGMENT } from '@writer-hub/shared'
import { yFragmentToProseMirrorJSON } from '@writer-hub/shared/collab-json'
import { prosemirrorToYXmlFragment, yXmlFragmentToProseMirrorRootNode } from 'y-prosemirror'
import * as Y from 'yjs'
import { buildSchema } from '@/features/sync/serialize'
import { RICH_DOCUMENT } from './fixtures'

/*
 * Server kolaborasi menurunkan `document_tabs.content` TANPA skema editor
 * (`@writer-hub/shared/collab-json`). Uji ini memastikan hasilnya, setelah
 * dibaca dengan skema - seperti setiap pembaca sisi server yang merender -
 * sama persis dengan jalur y-prosemirror + skema sungguhan.
 */
describe('turunan JSON tanpa skema', () => {
	const schema = buildSchema()

	function fragmentOf(json: typeof RICH_DOCUMENT): Y.XmlFragment {
		const doc = new Y.Doc()
		const fragment = doc.getXmlFragment(COLLAB_FRAGMENT)
		prosemirrorToYXmlFragment(schema.nodeFromJSON(json), fragment)
		return fragment
	}

	test('sama dengan jalur y-prosemirror + skema untuk naskah kaya', () => {
		const fragment = fragmentOf(RICH_DOCUMENT)
		const viaSchema = yXmlFragmentToProseMirrorRootNode(fragment, schema).toJSON()
		const viaServer = schema.nodeFromJSON(yFragmentToProseMirrorJSON(fragment)).toJSON()
		expect(viaServer).toEqual(viaSchema)
		// Dan keduanya tidak kehilangan apa pun dari naskah asalnya.
		expect(viaSchema).toEqual(schema.nodeFromJSON(RICH_DOCUMENT).toJSON())
	})

	test('mark bertumpuk berhash kembali ke nama aslinya', () => {
		const json = JSON.stringify(yFragmentToProseMirrorJSON(fragmentOf(RICH_DOCUMENT)))
		expect(json).toContain('"type":"comment"')
		expect(json).not.toMatch(/comment--/)
	})

	test('atribut bawaan null tidak ditulis; nilai yang ada utuh', () => {
		const raw = yFragmentToProseMirrorJSON(fragmentOf(RICH_DOCUMENT))
		const walk = (node: { attrs?: Record<string, unknown>; content?: unknown[] }): void => {
			for (const value of Object.values(node.attrs ?? {})) expect(value).not.toBeNull()
			for (const child of node.content ?? []) walk(child as typeof node)
		}
		walk(raw)
		expect(raw.content?.[0]).toMatchObject({ type: 'heading', attrs: { level: 1, textAlign: 'center' } })
	})
})
