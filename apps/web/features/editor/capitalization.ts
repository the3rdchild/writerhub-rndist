'use client'

import type { Editor } from '@tiptap/react'
export type CapitalizationMode = 'lower' | 'upper' | 'title'
function toTitleCase(text: string): string {
	return text.replace(
		/\p{L}[\p{L}\p{M}\p{N}'’-]*/gu,
		(word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase(),
	)
}

const TRANSFORMS: Record<CapitalizationMode, (text: string) => string> = {
	lower: (text) => text.toLowerCase(),
	upper: (text) => text.toUpperCase(),
	title: toTitleCase,
}
export function applyCapitalization(editor: Editor | null, mode: CapitalizationMode): boolean {
	if (!editor) return false

	const { from, to, empty } = editor.state.selection
	if (empty) return false

	const transform = TRANSFORMS[mode]
	const { tr } = editor.state
	let changed = false

	editor.state.doc.nodesBetween(from, to, (node, pos) => {
		if (!node.isText || !node.text) return
		const start = Math.max(pos, from)
		const end = Math.min(pos + node.nodeSize, to)
		if (start >= end) return

		const slice = node.text.slice(start - pos, end - pos)
		const next = transform(slice)
		if (next === slice) return
		tr.replaceWith(tr.mapping.map(start), tr.mapping.map(end), editor.schema.text(next, node.marks))
		changed = true
	})

	if (!changed) return false
	editor.view.dispatch(tr.scrollIntoView())
	editor.view.focus()
	return true
}
