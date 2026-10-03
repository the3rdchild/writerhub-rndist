import { type Editor, mergeAttributes } from '@tiptap/core'
import { OrderedList } from '@tiptap/extension-list'
import type { Node as PMNode, ResolvedPos } from '@tiptap/pm/model'

/*
 * Gaya penomoran, mulai ulang, dan lanjutkan nomor untuk daftar bernomor.
 * Dulu `orderedList.type/start` hanya bisa datang dari impor atau Markdown
 * "5. ", dan semua tingkat bersarang bernomor "1." (uji editor 2 Okt, TKS-10).
 */

export type NumberingType = '1' | 'a' | 'A' | 'i' | 'I'

export const NUMBERING_STYLES: readonly { type: NumberingType; label: string }[] = [
	{ type: '1', label: '1. 2. 3.' },
	{ type: 'a', label: 'a. b. c.' },
	{ type: 'A', label: 'A. B. C.' },
	{ type: 'i', label: 'i. ii. iii.' },
	{ type: 'I', label: 'I. II. III.' },
]

/**
 * Format bawaan tiap tingkat daftar bernomor yang tidak menyatakan `type`
 * sendiri, seperti Word: 1. → a. → i. → 1. … Dipakai CSS kanvas (lewat
 * selektor bersarang di globals.css) dan ekspor DOCX, jadi keduanya sama.
 */
export const ORDERED_LEVEL_TYPES: readonly NumberingType[] = ['1', 'a', 'i']
export const BULLET_LEVEL_STYLES = ['disc', 'circle', 'square'] as const

const LIST_STYLE_TYPES: Record<NumberingType, string> = {
	'1': 'decimal',
	a: 'lower-alpha',
	A: 'upper-alpha',
	i: 'lower-roman',
	I: 'upper-roman',
}

/**
 * Daftar bernomor dengan gaya yang terbaca CSS. Atribut `type` HTML dicocokkan
 * selektor tanpa membedakan huruf besar-kecil, jadi `ol[type='a']` dan
 * `ol[type='A']` sama-sama kena dan aturan terakhir menang - daftar huruf
 * kecil hasil impor tampil huruf besar. `data-list-type` membawa nama
 * `list-style-type`-nya, dan "1" tetap ditulis supaya daftar bersarang yang
 * sengaja bernomor angka tidak jatuh ke penanda bawaan tingkatnya.
 */
export const NumberedList = OrderedList.extend({
	renderHTML({ HTMLAttributes }) {
		const { start, type, ...rest } = HTMLAttributes
		const attrs = mergeAttributes(this.options.HTMLAttributes, rest)
		if (start !== 1) attrs.start = start
		const style = LIST_STYLE_TYPES[type as NumberingType]
		if (style) {
			attrs.type = type
			attrs['data-list-type'] = style
		}
		return ['ol', attrs, 0]
	},
})

export function defaultNumberingType(level: number): NumberingType {
	return ORDERED_LEVEL_TYPES[level % ORDERED_LEVEL_TYPES.length]
}

export function defaultBulletStyle(level: number): (typeof BULLET_LEVEL_STYLES)[number] {
	return BULLET_LEVEL_STYLES[level % BULLET_LEVEL_STYLES.length]
}

interface ListAt {
	node: PMNode
	pos: number
	depth: number
}

/** Daftar bernomor terdalam yang memuat posisi ini. */
export function orderedListAt($pos: ResolvedPos): ListAt | null {
	for (let depth = $pos.depth; depth > 0; depth--) {
		const node = $pos.node(depth)
		if (node.type.name === 'orderedList') return { node, pos: $pos.before(depth), depth }
	}
	return null
}

function updateList(editor: Editor, list: ListAt, attrs: Record<string, unknown>): boolean {
	return editor
		.chain()
		.focus()
		.command(({ tr }) => {
			tr.setNodeMarkup(list.pos, undefined, { ...list.node.attrs, ...attrs })
			return true
		})
		.run()
}

/** Gaya nomor daftar di kursor; di luar daftar, paragrafnya dijadikan daftar bernomor dulu. */
export function setNumberingType(editor: Editor, type: NumberingType): boolean {
	let list = orderedListAt(editor.state.selection.$from)
	if (!list) {
		if (!editor.chain().focus().toggleOrderedList().run()) return false
		list = orderedListAt(editor.state.selection.$from)
		if (!list) return false
	}
	return updateList(editor, list, { type })
}

export function setNumberingStart(editor: Editor, start: number): boolean {
	const list = orderedListAt(editor.state.selection.$from)
	if (!list || !Number.isFinite(start) || start < 0) return false
	return updateList(editor, list, { start: Math.floor(start) })
}

/**
 * Mulai ulang dari 1 di butir yang memuat kursor. Butir pertama cukup diberi
 * `start: 1`; butir di tengah memecah daftar menjadi dua, seperti Word.
 */
export function restartNumbering(editor: Editor): boolean {
	const { $from } = editor.state.selection
	const list = orderedListAt($from)
	if (!list) return false
	const itemIndex = $from.index(list.depth)
	if (itemIndex === 0) return updateList(editor, list, { start: 1 })

	const splitAt = $from.before(list.depth + 1)
	return editor
		.chain()
		.focus()
		.command(({ tr }) => {
			tr.split(splitAt, 1)
			const second = tr.doc.nodeAt(splitAt + 1)
			if (second?.type.name === 'orderedList') {
				tr.setNodeMarkup(splitAt + 1, undefined, { ...second.attrs, start: 1 })
			}
			return true
		})
		.run()
}

/** Daftar bernomor terdekat sebelum `list` di induk yang sama - sasaran "lanjutkan nomor". */
export function previousOrderedList(doc: PMNode, list: ListAt): ListAt | null {
	const $list = doc.resolve(list.pos)
	const parent = $list.parent
	const index = $list.index()
	let pos = $list.start()
	const before: ListAt[] = []
	for (let child = 0; child < index; child++) {
		const node = parent.child(child)
		if (node.type.name === 'orderedList') before.push({ node, pos, depth: list.depth })
		pos += node.nodeSize
	}
	return before.at(-1) ?? null
}

/** Lanjutkan nomor dari daftar bernomor sebelumnya, walau dipisah paragraf. */
export function continueNumbering(editor: Editor): boolean {
	const list = orderedListAt(editor.state.selection.$from)
	if (!list) return false
	const previous = previousOrderedList(editor.state.doc, list)
	if (!previous) return false
	const start = (Number(previous.node.attrs.start) || 1) + previous.node.childCount
	return updateList(editor, list, { start })
}
