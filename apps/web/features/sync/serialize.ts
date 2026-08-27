import { getSchema, type JSONContent } from '@tiptap/core'
import { prosemirrorToYXmlFragment, yXmlFragmentToProseMirrorRootNode } from 'y-prosemirror'
import type * as Y from 'yjs'
import { buildEditorExtensions } from '@/features/editor/extensions'
import { LOCAL_ORIGIN, tabFragment } from '@/features/sessions/ydoc'

export function buildSchema() {
	return getSchema(buildEditorExtensions())
}

export function fragmentToJSON(doc: Y.Doc, tabId: string): JSONContent {
	const json = yXmlFragmentToProseMirrorRootNode(tabFragment(doc, tabId), buildSchema()).toJSON()
	if (!Array.isArray(json.content) || json.content.length === 0) {
		return { type: 'doc', content: [{ type: 'paragraph' }] }
	}
	return json
}

export function jsonToFragment(doc: Y.Doc, tabId: string, json: JSONContent): void {
	const schema = buildSchema()
	const node = schema.nodeFromJSON(json)

	doc.transact(() => {
		const fragment = tabFragment(doc, tabId)
		if (fragment.length > 0) fragment.delete(0, fragment.length)
		prosemirrorToYXmlFragment(node, fragment)
	}, LOCAL_ORIGIN)
}
