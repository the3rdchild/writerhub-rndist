import type { JSONContent } from '@tiptap/core'
import type { Schema } from '@tiptap/pm/model'
import { COLLAB_FRAGMENT } from '@writer-hub/shared'
import { prosemirrorToYXmlFragment } from 'y-prosemirror'
import * as Y from 'yjs'

/**
 * Isi awal untuk tab server yang belum punya state Yjs. Server meminta SATU
 * klien menyemai (lihat `docs/collab-realtime.md`); klien itu membangun isinya
 * di Y.Doc sementara dan mengirimnya sebagai satu pembaruan - tidak pernah
 * langsung ke Y.Doc yang tersinkron, supaya semaian yang ditolak server tidak
 * tertinggal di salinan lokal.
 */

function encodeFragment(fill: (fragment: Y.XmlFragment) => void): Uint8Array {
	const doc = new Y.Doc()
	try {
		fill(doc.getXmlFragment(COLLAB_FRAGMENT))
		return Y.encodeStateAsUpdate(doc)
	} finally {
		doc.destroy()
	}
}

/**
 * Dari JSON ProseMirror (naskah server, `document_tabs.content`). Dokumen
 * tanpa isi menjadi satu paragraf kosong, bentuk yang sama dengan editor.
 */
export function seedUpdateFromJSON(json: JSONContent, schema: Schema): Uint8Array {
	const parsed = schema.nodeFromJSON(json)
	const node = parsed.childCount > 0 ? parsed : (schema.topNodeType.createAndFill() ?? parsed)
	return encodeFragment((fragment) => {
		prosemirrorToYXmlFragment(node, fragment)
	})
}

/**
 * Salinan persis fragmen lokal (tab di Y.Doc besar peramban). Tanpa melewati
 * JSON, jadi tidak ada yang hilang dalam terjemahan.
 */
export function seedUpdateFromFragment(source: Y.XmlFragment): Uint8Array {
	const copies = source
		.toArray()
		.map((node) => (node instanceof Y.XmlElement || node instanceof Y.XmlText ? node.clone() : null))
		.filter((node): node is Y.XmlElement | Y.XmlText => node !== null)
	return encodeFragment((fragment) => {
		fragment.insert(0, copies)
	})
}
