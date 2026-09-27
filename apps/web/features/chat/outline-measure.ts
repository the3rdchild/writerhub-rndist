'use client'

import type { Node as PMNode, Schema } from '@tiptap/pm/model'
import type { Editor } from '@tiptap/react'
import type { ResearchBrief } from '@writer-hub/shared'
import type * as Y from 'yjs'
import type { PageSetup } from '@/features/editor/page-geometry'
import { paginationKey } from '@/features/editor/pagination'
import { buildSchema, fragmentToJSON } from '@/features/sync/serialize'
import { type OutlineProgress, outlineProgress } from './outline-check'

let schema: Schema | null = null

/**
 * Semua tab dokumen sebagai dokumen ProseMirror. Kerangka satu dokumen bisa
 * tersebar di beberapa tab - CV di tab pertama, surat lamaran di tab kedua -
 * dan editor hanya memegang tab yang sedang terbuka.
 */
function tabDocs(doc: Y.Doc, tabIds: readonly string[]): PMNode[] {
	schema ??= buildSchema()
	return tabIds.flatMap((id) => {
		try {
			return [(schema as Schema).nodeFromJSON(fragmentToJSON(doc, id))]
		} catch {
			return []
		}
	})
}

/**
 * Panjang dokumen menurut paginasi editor. Hanya terukur bila dokumennya satu
 * tab dan berhalaman: tab lain tidak dipaginasi selama tidak dibuka.
 */
function measuredPages(editor: Editor | null, tabCount: number, setup: PageSetup): number | null {
	if (tabCount !== 1 || setup.pageless || !editor || editor.isDestroyed) return null
	return paginationKey.getState(editor.state)?.pageCount ?? null
}

export function measureOutline(input: {
	doc: Y.Doc
	tabIds: readonly string[]
	brief: ResearchBrief
	editor: Editor | null
	setup: PageSetup
}): OutlineProgress | null {
	if (input.brief.chapters.length === 0) return null
	return outlineProgress(
		tabDocs(input.doc, input.tabIds),
		input.brief,
		measuredPages(input.editor, input.tabIds.length, input.setup),
	)
}
