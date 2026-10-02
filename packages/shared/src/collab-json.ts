import * as Y from 'yjs'

/**
 * Naskah Yjs → JSON ProseMirror tanpa skema editor.
 *
 * Server kolaborasi tidak punya skema Tiptap (skemanya hidup di apps/web dan
 * menarik puluhan ekstensi), padahal `document_tabs.content` - yang dibaca AI
 * chat, draf, ekspor, dan tautan berbagi - harus diturunkan dari state Yjs.
 * Untungnya pengodean y-prosemirror/y-tiptap cukup sederhana untuk dibaca
 * balik apa adanya:
 *
 * - `Y.XmlElement` = simpul; `nodeName` adalah nama tipenya, atributnya adalah
 *   `attrs` (atribut bernilai null tidak pernah disimpan).
 * - `Y.XmlText` = deretan simpul teks; atribut format pada delta adalah mark,
 *   dikunci dengan nama mark (atau `nama--hash` untuk mark yang boleh
 *   bertumpuk) dan bernilai `attrs` mark itu.
 *
 * Bedanya dengan `node.toJSON()` dari skema hanya satu: atribut simpul yang
 * bernilai bawaan null tidak ikut tertulis. Pembaca yang memakai skema
 * (`schema.nodeFromJSON`) mengisinya kembali, dan uji di apps/web memastikan
 * hasilnya sama persis dengan jalur y-prosemirror + skema sungguhan.
 */

export interface ProseMirrorJSON {
	type: string
	attrs?: Record<string, unknown>
	content?: ProseMirrorJSON[]
	marks?: Array<{ type: string; attrs?: Record<string, unknown> }>
	text?: string
}

/** Sama dengan `yattr2markname` di y-prosemirror: buang akhiran hash mark bertumpuk. */
const HASHED_MARK = /(.*)(--[a-zA-Z0-9+/=]{8})$/

function markName(attributeName: string): string {
	return HASHED_MARK.exec(attributeName)?.[1] ?? attributeName
}

function hasKeys(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && Object.keys(value).length > 0
}

function textNodes(text: Y.XmlText): ProseMirrorJSON[] {
	const nodes: ProseMirrorJSON[] = []
	for (const op of text.toDelta() as Array<{ insert?: unknown; attributes?: Record<string, unknown> }>) {
		// y-prosemirror tidak pernah menyisipkan embed ke XmlText; yang bukan
		// string diabaikan daripada menghasilkan simpul teks yang rusak.
		if (typeof op.insert !== 'string' || op.insert.length === 0) continue
		const node: ProseMirrorJSON = { type: 'text', text: op.insert }
		if (op.attributes && Object.keys(op.attributes).length > 0) {
			node.marks = Object.entries(op.attributes).map(([key, attrs]) =>
				hasKeys(attrs) ? { type: markName(key), attrs } : { type: markName(key) },
			)
		}
		nodes.push(node)
	}
	return nodes
}

function children(parent: Y.XmlFragment | Y.XmlElement): ProseMirrorJSON[] {
	const out: ProseMirrorJSON[] = []
	for (const child of parent.toArray()) {
		if (child instanceof Y.XmlText) out.push(...textNodes(child))
		else if (child instanceof Y.XmlElement) out.push(elementNode(child))
	}
	return out
}

function elementNode(element: Y.XmlElement): ProseMirrorJSON {
	const node: ProseMirrorJSON = { type: element.nodeName }
	const attrs: Record<string, unknown> = {}
	for (const [key, value] of Object.entries(element.getAttributes())) {
		// `ychange` adalah penanda riwayat milik y-prosemirror, bukan atribut naskah.
		if (value !== null && value !== undefined && key !== 'ychange') attrs[key] = value
	}
	if (Object.keys(attrs).length > 0) node.attrs = attrs
	const content = children(element)
	if (content.length > 0) node.content = content
	return node
}

/**
 * JSON dokumen dari fragmen naskah. Fragmen kosong menjadi satu paragraf
 * kosong - bentuk yang sama dengan `fragmentToJSON` di apps/web - karena
 * `doc` tanpa isi tidak sah menurut skema.
 */
export function yFragmentToProseMirrorJSON(fragment: Y.XmlFragment): ProseMirrorJSON {
	const content = children(fragment)
	return { type: 'doc', content: content.length > 0 ? content : [{ type: 'paragraph' }] }
}
