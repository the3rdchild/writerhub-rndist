import type { AnalysisFeature, AnalysisResultFor } from '@writer-hub/shared'

const RANGE_FIELDS = {
	ai_detector: 'sentences',
	ai_rewriter: 'changes',
	humanizer: 'changes',
	plagiarism: 'flagged_phrases',
	translator: 'changes',
	glossary: null,
} as const satisfies Record<AnalysisFeature, string | null>

export function shiftAnalysisResult<F extends AnalysisFeature>(
	feature: F,
	result: AnalysisResultFor<F>,
	offset: number,
): AnalysisResultFor<F> {
	if (offset === 0) return result

	const field: string | null = RANGE_FIELDS[feature]
	if (field === null) return result

	const ranges = (result as unknown as Record<string, unknown>)[field]
	if (!Array.isArray(ranges)) return result

	return {
		...result,
		[field]: ranges.map((item: { offset: number }) => ({ ...item, offset: item.offset + offset })),
	}
}
