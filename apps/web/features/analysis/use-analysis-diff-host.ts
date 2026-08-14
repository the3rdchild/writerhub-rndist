'use client'

import { useEffect } from 'react'
import { useEditorInstance } from '@/features/editor/editor-context'
import { analysisDiffHighlightKey } from './analysis-diff-highlight'
import { useAnalysisDiffContext } from './analysis-diff-context'

/**
 * Jembatan antara context diff aktif dan editor utama: kirim rentang ke plugin
 * dekorasi `AnalysisDiffHighlight` tiap kali diff aktif berubah.
 *
 * Dipasang sekali di komponen editor utama (`TiptapEditor`), bukan di tiap
 * panel - supaya tiap panel cukup menulis ke context, dan editor tetap
 * satu-satunya pemilik transaksi ProseMirror.
 */
export function useAnalysisDiffHost(): void {
	const { editor } = useEditorInstance()
	const { activeDiff } = useAnalysisDiffContext()

	useEffect(() => {
		if (!editor) return
		const ranges = activeDiff?.ranges ?? null
		editor.view.dispatch(editor.state.tr.setMeta(analysisDiffHighlightKey, ranges))
	}, [editor, activeDiff])
}
