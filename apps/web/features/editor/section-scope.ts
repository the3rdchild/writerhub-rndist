'use client'

import type { Editor } from '@tiptap/react'
import { pageBlockRange, pageOfPos, paginationKey } from './pagination'
export type SectionScope = 'from_here' | 'this_page'

export const SECTION_SCOPES: readonly SectionScope[] = ['from_here', 'this_page']

export function isSectionScope(value: unknown): value is SectionScope {
	return value === 'from_here' || value === 'this_page'
}

export function sectionRange(editor: Editor, scope: SectionScope): { from: number; to?: number } | null {
	if (editor.isDestroyed) return null
	const { doc, selection } = editor.state

	if (scope === 'from_here') {
		const { $from } = selection
		/*
		 * Node tingkat-teratas yang terpilih utuh - pemenggal halaman "Halaman
		 * Baru", pemisah bagian, gambar - punya depth 0, dan posisinya SUDAH
		 * posisi sebelum node itu. Meminta `before(0)` melempar RangeError
		 * "There is no position before the top-level node": tidak ada apa pun
		 * sebelum akar dokumen.
		 */
		return { from: $from.depth === 0 ? $from.pos : $from.before(1) }
	}

	const pagination = paginationKey.getState(editor.state)
	if (!pagination) return null

	const page = pageOfPos(pagination.blockPages, selection.from)
	if (page === null) return null

	return pageBlockRange(pagination.blockPages, page, doc.content.size)
}
