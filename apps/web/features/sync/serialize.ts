import { getSchema, type JSONContent } from '@tiptap/core'
import { prosemirrorToYXmlFragment, yXmlFragmentToProseMirrorRootNode } from 'y-prosemirror'
import type * as Y from 'yjs'
import { buildEditorExtensions } from '@/features/editor/extensions'
import { LOCAL_ORIGIN, tabFragment } from '@/features/sessions/ydoc'

/**
 * Jembatan antara naskah di Y.Doc dan JSON ProseMirror/Tiptap yang disimpan
 * server (§5.1 PRD).
 *
 * Skema selalu dibangun dari `buildEditorExtensions` - alasan yang sama dengan
 * `migrate-legacy.ts`: node yang tidak dikenal skema akan dibuang diam-diam
 * saat naskah dibaca, jadi memakai skema seadanya di sini berarti tabel,
 * rumus, dan penanda komentar hilang dalam perjalanan ke cloud.
 */

/** Skema editor tanpa memasang view - aman dipanggil di luar peramban. */
function buildSchema() {
	return getSchema(buildEditorExtensions())
}

/** Baca naskah satu tab dari Y.Doc menjadi JSON untuk dikirim ke server. */
export function fragmentToJSON(doc: Y.Doc, tabId: string): JSONContent {
	const json = yXmlFragmentToProseMirrorRootNode(tabFragment(doc, tabId), buildSchema()).toJSON()

	// Fragmen kosong dibaca sebagai `doc` tanpa anak, padahal skema mewajibkan
	// minimal satu blok - JSON itu tidak akan bisa dimuat balik.
	if (!Array.isArray(json.content) || json.content.length === 0) {
		return { type: 'doc', content: [{ type: 'paragraph' }] }
	}
	return json
}

/** Timpa naskah satu tab dengan JSON dari server. */
export function jsonToFragment(doc: Y.Doc, tabId: string, json: JSONContent): void {
	const schema = buildSchema()
	const node = schema.nodeFromJSON(json)

	doc.transact(() => {
		const fragment = tabFragment(doc, tabId)
		if (fragment.length > 0) fragment.delete(0, fragment.length)
		prosemirrorToYXmlFragment(node, fragment)
	}, LOCAL_ORIGIN)
}
