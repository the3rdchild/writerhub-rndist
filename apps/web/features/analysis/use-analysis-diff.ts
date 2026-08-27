'use client'

import { useEffect, useMemo } from 'react'
import { useDocument } from '@/features/document/document-context'
import type { VersionDiffRange } from '@/features/versions/diff'
import {
	type AnalysisDiffFeature,
	computeAnalysisDiff,
	type PendingEdit,
	synthesizeResultText,
} from './analysis-diff'
import { useAnalysisDiffContext } from './analysis-diff-context'

export {
	computeAnalysisDiff,
	editsFromChanges,
	editsFromSentences,
	editsFromSuggestions,
	synthesizeResultText,
} from './analysis-diff'

export type { AnalysisDiffFeature, PendingEdit }

export function useAnalysisDiff(
	feature: AnalysisDiffFeature,
	edits: readonly PendingEdit[],
): {
	isEnabled: boolean
	enable: () => void
	disable: () => void
	hasEdits: boolean
} {
	const { state } = useDocument()
	const { enable: enableCtx, disable: disableCtx, publish, isEnabled } = useAnalysisDiffContext()

	const baseText = state.text
	const ranges = useMemo<VersionDiffRange[]>(() => {
		if (edits.length === 0) return []
		const resultText = synthesizeResultText(baseText, edits)
		return computeAnalysisDiff(baseText, resultText)
	}, [baseText, edits])

	const enabled = isEnabled(feature)
	useEffect(() => {
		if (enabled) publish(feature, ranges)
	}, [enabled, feature, ranges, publish])
	useEffect(
		() => () => {
			disableCtx(feature)
		},
		[disableCtx, feature],
	)

	return {
		isEnabled: enabled,
		enable: () => enableCtx(feature),
		disable: () => disableCtx(feature),
		hasEdits: edits.length > 0,
	}
}
