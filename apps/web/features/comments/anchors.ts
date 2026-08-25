'use client'

import type { Editor } from '@tiptap/core'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import { COMMENT_MARK } from './comment-mark'
export interface CommentRange {
	from: number
	to: number
}
export function commentRangesInDoc(doc: ProseMirrorNode): Map<string, CommentRange> {
	const ranges = new Map<string, CommentRange>()

	doc.descendants((node, pos) => {
		if (!node.isText) return

		for (const mark of node.marks) {
			if (mark.type.name !== COMMENT_MARK) continue
			const id = mark.attrs.commentId
			if (typeof id !== 'string') continue
			const known = ranges.get(id)
			ranges.set(id, {
				from: known ? Math.min(known.from, pos) : pos,
				to: known ? Math.max(known.to, pos + node.nodeSize) : pos + node.nodeSize,
			})
		}
	})

	return ranges
}
export function commentRanges(editor: Editor): Map<string, CommentRange> {
	if (editor.isDestroyed) return new Map()
	return commentRangesInDoc(editor.state.doc)
}
export function commentRange(editor: Editor, id: string): CommentRange | null {
	return commentRanges(editor).get(id) ?? null
}
export function scrollToComment(editor: Editor, id: string): boolean {
	const range = commentRange(editor, id)
	if (!range) return false

	editor.chain().focus().setTextSelection(range.from).run()

	const dom = editor.view.domAtPos(range.from).node
	const element = dom instanceof HTMLElement ? dom : dom.parentElement
	element?.scrollIntoView({ behavior: 'smooth', block: 'center' })
	return true
}
