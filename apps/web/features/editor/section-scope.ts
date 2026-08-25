'use client'

import type { Editor } from '@tiptap/react'
import { pageBlockRange, pageOfPos, paginationKey } from './pagination'
export type SectionScope = 'from_here' | 'this_page'

export const SECTION_SCOPES: readonly SectionScope[] = ['from_here', 'this_page']

export function isSectionScope(value: unknown): value is SectionScope {
	return value === 'from_here' || value === 'this_page'
}
export function sectionRange(
	editor: Editor,
	scope: SectionScope,
): { from: number; to?: number } | null {
	if (editor.isDestroyed) return null
	const { doc, selection } = editor.state

	if (scope === 'from_here') {
		const depth = selection.$from.depth === 0 ? 0 : 1
		return { from: selection.$from.before(depth || undefined) }
	}

	const pagination = paginationKey.getState(editor.state)
	if (!pagination) return null

	const page = pageOfPos(pagination.blockPages, selection.from)
	if (page === null) return null

	return pageBlockRange(pagination.blockPages, page, doc.content.size)
}
