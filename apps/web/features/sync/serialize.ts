import { type Editor, getSchema, type JSONContent } from '@tiptap/core'
import { prosemirrorToYXmlFragment, yXmlFragmentToProseMirrorRootNode } from 'y-prosemirror'
import type * as Y from 'yjs'
import { buildEditorExtensions } from '@/features/editor/extensions'
import { LOCAL_ORIGIN, tabFragment } from '@/features/sessions/ydoc'

export function buildSchema() {
	return getSchema(buildEditorExtensions())
}

/**
 * Editor ini menampilkan fragmen `tabId` di Y.Doc besar? Sesaat setelah tab
 * berganti, editor di konteks bisa masih milik tab sebelumnya - editor lama
 * dilepas dulu, dihancurkan belakangan - dan editor tab kolaboratif terikat ke
 * Y.Doc sesinya. Isi keduanya bukan isi tab ini.
 */
export function editorShowsTab(editor: Editor, doc: Y.Doc, tabId: string): boolean {
	// Editor yang sudah dihancurkan tidak lagi punya extensionManager.
	const manager = editor.extensionManager as Editor['extensionManager'] | null
	const collaboration = manager?.extensions.find((extension) => extension.name === 'collaboration')
	const options = collaboration?.options as { document?: unknown; field?: unknown } | undefined
	return options?.document === doc && options?.field === tabId
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
