'use client'

import { Extension } from '@tiptap/core'
import type { EditorState, Transaction } from '@tiptap/pm/state'
import type { Editor } from '@tiptap/react'

const KEPT = ['paragraph', 'heading', 'blockquote']

/** Google mencentang "Cegah baris tunggal" secara baku, jadi bakunya `true`. */
export const DEFAULT_WIDOW_CONTROL = true

export interface BlockKeepAttrs {
	keepWithNext?: boolean
	keepLines?: boolean
	widowControl?: boolean
	pageBreakBefore?: boolean
}

export interface BlockKeepValues {
	keepWithNext: boolean
	keepLines: boolean
	widowControl: boolean
	pageBreakBefore: boolean
}

declare module '@tiptap/core' {
	interface Commands<ReturnType> {
		blockKeep: {
			setBlockKeep: (attrs: BlockKeepAttrs) => ReturnType
		}
	}
}

export const BlockKeep = Extension.create({
	name: 'blockKeep',

	addGlobalAttributes() {
		return [
			{
				types: KEPT,
				attributes: {
					keepWithNext: {
						default: false,
						parseHTML: (element) => element.style.breakAfter === 'avoid',
						renderHTML: (attributes) =>
							attributes.keepWithNext ? { style: 'break-after: avoid' } : {},
					},
					keepLines: {
						default: false,
						parseHTML: (element) => element.style.breakInside === 'avoid',
						renderHTML: (attributes) => (attributes.keepLines ? { style: 'break-inside: avoid' } : {}),
					},
					widowControl: {
						default: DEFAULT_WIDOW_CONTROL,
						// orphans/widows 1 berarti pengendalian baris tunggal dimatikan;
						// tanpa penanda apa pun ia dianggap aktif (sesuai baku Google).
						parseHTML: (element) => {
							const orphans = Number.parseInt(element.style.orphans ?? '', 10)
							return !Number.isFinite(orphans) || orphans > 1
						},
						renderHTML: (attributes) =>
							attributes.widowControl === false
								? { style: 'orphans: 1; widows: 1' }
								: { style: 'orphans: 2; widows: 2' },
					},
					pageBreakBefore: {
						default: false,
						parseHTML: (element) => element.style.breakBefore === 'page',
						renderHTML: (attributes) =>
							attributes.pageBreakBefore ? { style: 'break-before: page' } : {},
					},
				},
			},
		]
	},

	addCommands() {
		return {
			setBlockKeep:
				(attrs) =>
				({ state, tr, dispatch }) => {
					const touched = applyBlockKeep(state, tr, attrs)
					if (touched && dispatch) dispatch(tr)
					return touched
				},
		}
	},
})

/** Menerapkan atribut keep ke tiap blok yang beririsan dengan seleksi. */
export function applyBlockKeep(
	state: EditorState,
	tr: Transaction,
	attrs: BlockKeepAttrs,
): boolean {
	const { from, to } = state.selection
	let touched = false
	state.doc.nodesBetween(from, to, (node, pos) => {
		if (!KEPT.includes(node.type.name)) return
		for (const [key, value] of Object.entries(attrs)) {
			if (value === undefined) continue
			if (node.attrs[key] === value) continue
			tr.setNodeAttribute(pos, key, value)
			touched = true
		}
	})
	return touched
}

/** Membaca keempat nilai keep efektif pada blok tempat seleksi berada. */
export function blockKeepAt(editor: Editor): BlockKeepValues {
	const { $from } = editor.state.selection

	for (let depth = $from.depth; depth >= 0; depth -= 1) {
		const node = $from.node(depth)
		if (!KEPT.includes(node.type.name)) continue
		return {
			keepWithNext: (node.attrs.keepWithNext as boolean | null) ?? false,
			keepLines: (node.attrs.keepLines as boolean | null) ?? false,
			widowControl: (node.attrs.widowControl as boolean | null) ?? DEFAULT_WIDOW_CONTROL,
			pageBreakBefore: (node.attrs.pageBreakBefore as boolean | null) ?? false,
		}
	}
	return {
		keepWithNext: false,
		keepLines: false,
		widowControl: DEFAULT_WIDOW_CONTROL,
		pageBreakBefore: false,
	}
}
