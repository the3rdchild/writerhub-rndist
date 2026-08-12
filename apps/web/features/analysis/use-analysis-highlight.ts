'use client'

import type { AnalysisFeature } from '@writer-hub/shared'
import { useEffect } from 'react'
import { useEditorInstance } from '@/features/editor/editor-context'
import { analysisHighlightKey, type AnalysisHighlightRange } from './analysis-highlight'

/**
 * Pasang sorotan analisis di editor untuk satu sumber.
 *
 * Rentang dikirim ulang setiap kali berubah (mis. satu change diterima), dan
 * sumbernya dibersihkan saat komponen dilepas atau editor berganti tab. Editor
 * yang sudah dibubarkan tidak dikirimi transaksi apa pun.
 */
export function useAnalysisHighlight(
	source: AnalysisFeature,
	ranges: readonly AnalysisHighlightRange[],
): void {
	const { editor } = useEditorInstance()

	useEffect(() => {
		if (!editor) return
		editor.view.dispatch(editor.state.tr.setMeta(analysisHighlightKey, { source, ranges }))
	}, [editor, source, ranges])

	useEffect(
		() => () => {
			if (!editor || editor.isDestroyed) return
			editor.view.dispatch(editor.state.tr.setMeta(analysisHighlightKey, { source, ranges: [] }))
		},
		[editor, source],
	)
}
