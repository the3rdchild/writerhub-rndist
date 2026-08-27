'use client'

import { useEffect } from 'react'
import { useEditorInstance } from '@/features/editor/editor-context'
import { useAnalysisDiffContext } from './analysis-diff-context'
import { analysisDiffHighlightKey } from './analysis-diff-highlight'

export function useAnalysisDiffHost(): void {
	const { editor } = useEditorInstance()
	const { activeDiff } = useAnalysisDiffContext()

	useEffect(
		function pushDiffHighlights() {
			if (!editor) return
			const ranges = activeDiff?.ranges ?? null
			editor.view.dispatch(editor.state.tr.setMeta(analysisDiffHighlightKey, ranges))
		},
		[editor, activeDiff],
	)
}
