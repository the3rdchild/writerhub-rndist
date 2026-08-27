'use client'

import type { Editor } from '@tiptap/react'

const SPACED = ['paragraph', 'heading', 'blockquote']

export interface BlockSpacingValues {
	lineHeight: string | null
	spaceBefore: number
	spaceAfter: number
}

/**
 * Membaca spasi blok efektif pada seleksi, meniru `lineHeightAt`:
 * berjalan naik dari kedalaman kursor sampai menemukan blok pertama
 * yang bisa diberi spasi. spaceBefore/spaceAfter yang belum diatur
 * dibaca sebagai 0 supaya dialog bisa langsung menampilkannya.
 */
export function blockSpacingAt(editor: Editor): BlockSpacingValues {
	const { $from } = editor.state.selection

	for (let depth = $from.depth; depth >= 0; depth -= 1) {
		const node = $from.node(depth)
		if (!SPACED.includes(node.type.name)) continue
		return {
			lineHeight: (node.attrs.lineHeight as string | null) ?? null,
			spaceBefore: (node.attrs.spaceBefore as number | null) ?? 0,
			spaceAfter: (node.attrs.spaceAfter as number | null) ?? 0,
		}
	}
	return { lineHeight: null, spaceBefore: 0, spaceAfter: 0 }
}
