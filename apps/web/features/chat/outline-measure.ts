'use client'

import type { Node as PMNode, Schema } from '@tiptap/pm/model'
import type { Editor } from '@tiptap/react'
import type { ResearchBrief } from '@writer-hub/shared'
import { headingBreakLevels } from '@writer-hub/shared'
import type * as Y from 'yjs'
import type { PageSetup } from '@/features/editor/page-geometry'
import { paginationKey } from '@/features/editor/pagination'
import { resolveTypography } from '@/features/sessions/ydoc'
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

/**
 * Tingkat heading yang memaksa halaman baru di tipografi dokumen ini, dipakai
 * menghitung batas bawah halaman wajib (TP-2). Hanya terukur bila satu tab.
 */
function breakLevelsOf(doc: Y.Doc, tabIds: readonly string[], tabCount: number): readonly number[] {
	if (tabCount !== 1 || tabIds.length === 0) return []
	return headingBreakLevels(resolveTypography(doc, tabIds[0]))
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
		breakLevelsOf(input.doc, input.tabIds, input.tabIds.length),
	)
}
