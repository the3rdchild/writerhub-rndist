'use client'

import type { Editor } from '@tiptap/core'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import { COMMENT_MARK } from './comment-mark'

/**
 * Letak komentar di dalam naskah.
 *
 * Semua pemakainya - panel, gutter, dan pembersih utas yatim - butuh jawaban
 * atas pertanyaan yang sama: mark ini ada di posisi berapa, kalau masih ada.
 * Dijawab dengan satu kali jalan menyusuri dokumen, bukan sekali per komentar:
 * pada naskah puluhan halaman dengan belasan komentar, bedanya nyata setiap
 * kali gutter menghitung ulang posisinya.
 */

export interface CommentRange {
	from: number
	to: number
}

/** Rentang tiap komentar di dalam sebuah dokumen ProseMirror. */
export function commentRangesInDoc(doc: ProseMirrorNode): Map<string, CommentRange> {
	const ranges = new Map<string, CommentRange>()

	doc.descendants((node, pos) => {
		if (!node.isText) return

		for (const mark of node.marks) {
			if (mark.type.name !== COMMENT_MARK) continue
			const id = mark.attrs.commentId
			if (typeof id !== 'string') continue

			// Satu komentar kerap terpecah jadi beberapa text node - tebal di
			// tengah kalimat sudah cukup untuk memecahnya. Yang dicatat karena itu
			// rentang gabungannya, dari awal potongan pertama sampai akhir yang
			// terakhir.
			const known = ranges.get(id)
			ranges.set(id, {
				from: known ? Math.min(known.from, pos) : pos,
				to: known ? Math.max(known.to, pos + node.nodeSize) : pos + node.nodeSize,
			})
		}
	})

	return ranges
}

/** Rentang tiap komentar yang mark-nya masih ada di naskah yang sedang dibuka. */
export function commentRanges(editor: Editor): Map<string, CommentRange> {
	if (editor.isDestroyed) return new Map()
	return commentRangesInDoc(editor.state.doc)
}

/** Rentang satu komentar; null kalau mark-nya sudah tidak ada di naskah. */
export function commentRange(editor: Editor, id: string): CommentRange | null {
	return commentRanges(editor).get(id) ?? null
}

/** Bawa pandangan ke komentar ini. Salah kalau mark-nya sudah hilang. */
export function scrollToComment(editor: Editor, id: string): boolean {
	const range = commentRange(editor, id)
	if (!range) return false

	editor.chain().focus().setTextSelection(range.from).run()

	const dom = editor.view.domAtPos(range.from).node
	const element = dom instanceof HTMLElement ? dom : dom.parentElement
	element?.scrollIntoView({ behavior: 'smooth', block: 'center' })
	return true
}
