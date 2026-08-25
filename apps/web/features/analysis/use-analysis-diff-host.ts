'use client'

import { useEffect } from 'react'
import { useEditorInstance } from '@/features/editor/editor-context'
import { analysisDiffHighlightKey } from './analysis-diff-highlight'
import { useAnalysisDiffContext } from './analysis-diff-context'
export function useAnalysisDiffHost(): void {
	const { editor } = useEditorInstance()
	const { activeDiff } = useAnalysisDiffContext()

	useEffect(() => {
		if (!editor) return
		const ranges = activeDiff?.ranges ?? null
		editor.view.dispatch(editor.state.tr.setMeta(analysisDiffHighlightKey, ranges))
	}, [editor, activeDiff])
}
