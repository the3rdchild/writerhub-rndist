import { type Editor, type JSONContent, mergeAttributes, Node } from '@tiptap/core'
import { Fragment, type Node as PMNode, type Schema, Slice } from '@tiptap/pm/model'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import { shortcutKeys } from '@/features/shortcuts/registry'

/*
 * Catatan kaki ala Word: isi catatan disimpan di rujukannya sendiri
 * (`footnoteRef.attrs.content`, isi satu paragraf), jadi menghapus rujukan
 * menghapus catatannya dan salin-tempel membawa catatannya. Nomor = urutan
 * rujukan di naskah. Catatan tampil di kaki halaman tempat rujukannya jatuh
 * (`pagination.ts`) dan menjadi catatan kaki Word sungguhan saat diekspor.
 *
 * Dulu tombol Catatan kaki hanya menyisipkan penanda kosong tanpa nomor dan
 * tanpa tempat mengetik isinya (uji editor 2 Okt, TKS-1). Node `footnote`
 * (blok isi terpisah) tetap ada di skema untuk naskah lama.
 */

export const FOOTNOTE_REF = 'footnoteRef'
export const FOOTNOTE_BODY = 'footnote'

export const footnoteRefDecorationKey = new PluginKey<DecorationSet>('footnoteRefDecoration')

declare module '@tiptap/core' {
	interface Commands<ReturnType> {
		footnote: {
			/** Sisip rujukan catatan kaki di kursor; isinya lalu diketik di editor catatan. */
			insertFootnote: (options?: { id?: string; content?: JSONContent[] }) => ReturnType
			/** Ganti isi catatan milik rujukan di `pos`. */
			setFootnoteContent: (pos: number, content: JSONContent[]) => ReturnType
		}
	}
}

export function newFootnoteId(): string {
	return `fn-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
}

export interface FootnoteEntry {
	pos: number
	id: string | null
	number: number
	content: JSONContent[]
}

/** Semua rujukan catatan kaki menurut urutan di naskah, bernomor 1..N. */
export function footnoteEntries(doc: PMNode): FootnoteEntry[] {
	const entries: FootnoteEntry[] = []
	doc.descendants((node, pos) => {
		if (node.type.name !== FOOTNOTE_REF) return true
		entries.push({
			pos,
			id: (node.attrs.id as string | null) ?? null,
			number: entries.length + 1,
			content: footnoteContent(node),
		})
		return false
	})
	return entries
}

export function footnoteContent(node: PMNode): JSONContent[] {
	const content = node.attrs.content as unknown
	return Array.isArray(content) ? (content as JSONContent[]) : []
}

/** Isi catatan sebagai paragraf skema - untuk dirender atau diekspor. */
export function footnoteParagraph(schema: Schema, content: readonly JSONContent[]): PMNode {
	try {
		return schema.nodes.paragraph.create(null, Fragment.fromJSON(schema, content as JSONContent[]))
	} catch {
		const text = content.map((part) => part.text ?? '').join('')
		return schema.nodes.paragraph.create(null, text ? schema.text(text) : null)
	}
}

function parseContent(raw: string | null): JSONContent[] {
	if (!raw) return []
	try {
		const parsed = JSON.parse(raw) as unknown
		return Array.isArray(parsed) ? (parsed as JSONContent[]) : []
	} catch {
		return []
	}
}

/** Rujukan yang ditempel mendapat id baru, supaya salinan tidak berbagi id dengan aslinya. */
function withFreshIds(fragment: Fragment): Fragment {
	const children: PMNode[] = []
	fragment.forEach((child) => {
		if (child.type.name === FOOTNOTE_REF) {
			children.push(child.type.create({ ...child.attrs, id: newFootnoteId() }, null, child.marks))
		} else {
			children.push(child.copy(withFreshIds(child.content)))
		}
	})
	return Fragment.from(children)
}

export const Footnote = Node.create({
	name: FOOTNOTE_BODY,
	group: 'block',
	content: 'inline*',
	defining: true,

	addAttributes() {
		return { id: { default: null } }
	},

	parseHTML() {
		return [{ tag: 'footnote' }, { tag: 'section[data-type="footnote"]' }]
	},

	renderHTML({ HTMLAttributes }) {
		return ['section', mergeAttributes(HTMLAttributes, { 'data-type': 'footnote' }), 0]
	},
})

export const FootnoteRef = Node.create({
	name: FOOTNOTE_REF,
	group: 'inline',
	inline: true,
	atom: true,
	selectable: true,

	addAttributes() {
		return {
			id: { default: null },
			content: {
				default: [],
				parseHTML: (element) => parseContent(element.getAttribute('data-content')),
				renderHTML: (attributes) =>
					Array.isArray(attributes.content) && attributes.content.length > 0
						? { 'data-content': JSON.stringify(attributes.content) }
						: {},
			},
		}
	},

	/* Prioritas di atas mark Superscript (50): tanpa itu `<sup>` rujukan dibaca
	 * sebagai superskrip kosong, dan rujukan hilang saat ditempel atau dimuat. */
	parseHTML() {
		return [
			{ tag: 'footnote-ref', priority: 60 },
			{ tag: 'sup[data-type="footnote-ref"]', priority: 60 },
		]
	},

	renderHTML({ HTMLAttributes }) {
		return ['sup', mergeAttributes({ 'data-type': 'footnote-ref' }, HTMLAttributes)]
	},

	addCommands() {
		return {
			insertFootnote:
				(options = {}) =>
				({ commands }) =>
					commands.insertContent({
						type: FOOTNOTE_REF,
						attrs: { id: options.id ?? newFootnoteId(), content: options.content ?? [] },
					}),
			setFootnoteContent:
				(pos, content) =>
				({ tr, dispatch }) => {
					const node = tr.doc.nodeAt(pos)
					if (!node || node.type.name !== FOOTNOTE_REF) return false
					if (dispatch) tr.setNodeMarkup(pos, undefined, { ...node.attrs, content })
					return true
				},
		}
	},

	addKeyboardShortcuts() {
		return {
			[shortcutKeys('doc.footnote')]: () => insertFootnoteAndEdit(this.editor),
		}
	},

	addProseMirrorPlugins() {
		return [
			new Plugin<DecorationSet>({
				key: footnoteRefDecorationKey,
				state: {
					init: (_, state) => footnoteDecorations(state.doc, state.selection.from, state.selection.to),
					apply: (tr, old) =>
						tr.docChanged || tr.selectionSet
							? footnoteDecorations(tr.doc, tr.selection.from, tr.selection.to)
							: old,
				},
				props: {
					decorations(state) {
						return this.getState(state)
					},
					/* Naskah bercatatan kaki dicetak mengikuti pemenggalan kanvas (lihat globals.css). */
					attributes: (state): Record<string, string> => {
						const decorations = footnoteRefDecorationKey.getState(state) as DecorationSet | undefined
						return decorations && decorations.find().length > 0 ? { class: 'has-footnotes' } : {}
					},
					transformPasted(slice) {
						let hasRef = false
						slice.content.descendants((node) => {
							if (node.type.name === FOOTNOTE_REF) hasRef = true
							return !hasRef
						})
						return hasRef ? new Slice(withFreshIds(slice.content), slice.openStart, slice.openEnd) : slice
					},
				},
			}),
		]
	},
})

/** Nomor tiap rujukan (atribut `data-number`, digambar CSS) dan sorotan rujukan terpilih. */
function footnoteDecorations(doc: PMNode, from: number, to: number): DecorationSet {
	const decorations = footnoteEntries(doc).map((entry) =>
		Decoration.node(entry.pos, entry.pos + 1, {
			'data-number': String(entry.number),
			...(entry.pos >= from && entry.pos < Math.max(to, from + 1) ? { class: 'footnote-ref--active' } : {}),
		}),
	)
	return DecorationSet.create(doc, decorations)
}

// ── permintaan editor catatan ──────────────────────────────────────────────

/** Toolbar, Sisip, slash, dan Ctrl+Alt+F: sisip rujukan lalu langsung buka editor isinya. */
export function insertFootnoteAndEdit(editor: Editor): boolean {
	if (!editor.chain().focus().insertFootnote().run()) return false
	requestFootnoteEditor(editor.state.selection.from - 1)
	return true
}

const EDIT_EVENT = 'writer-hub:edit-footnote'

/** Buka editor catatan untuk rujukan di `pos` (dipasang di `FootnotePopover`). */
export function requestFootnoteEditor(pos: number): void {
	if (typeof window === 'undefined') return
	window.dispatchEvent(new CustomEvent<number>(EDIT_EVENT, { detail: pos }))
}

export function onFootnoteEditorRequest(listener: (pos: number) => void): () => void {
	const handler = (event: Event) => listener((event as CustomEvent<number>).detail)
	window.addEventListener(EDIT_EVENT, handler)
	return () => window.removeEventListener(EDIT_EVENT, handler)
}
