import type { AnalysisFeature, TextChange } from '@writer-hub/shared'
import type { EditorSuggestion } from '@/features/document/suggestions'
import { replaceRange } from '@/features/document/suggestions'
import type { VersionDiffRange } from '@/features/versions/diff'
import { computeVersionDiff } from '@/features/versions/diff'
export type AnalysisDiffFeature = AnalysisFeature | 'proofreader'

interface AppliedChangeLike {
	offset: number
	original: string
}

export interface PendingEdit {
	offset: number
	length: number
	replacement: string
}

export function synthesizeResultText(baseText: string, edits: readonly PendingEdit[]): string {
	const ordered = [...edits].sort((a, b) => b.offset - a.offset)
	return ordered.reduce((text, edit) => replaceRange(text, edit, edit.replacement), baseText)
}

export function editsFromChanges(
	pending: readonly TextChange[],
	applied: readonly AppliedChangeLike[],
): PendingEdit[] {
	const appliedKeys = new Set(applied.map((entry) => `${entry.offset}:${entry.original}`))
	return pending
		.filter((change) => !appliedKeys.has(`${change.offset}:${change.original}`))
		.map((change) => ({
			offset: change.offset,
			length: change.length,
			replacement: change.replacement,
		}))
}

export function editsFromSuggestions(suggestions: readonly EditorSuggestion[]): PendingEdit[] {
	return suggestions
		.filter((suggestion) => !suggestion.dismissed)
		.map((suggestion) => ({
			offset: suggestion.offset ?? 0,
			length: suggestion.length ?? suggestion.original.length,
			replacement: suggestion.replacement,
		}))
}

export interface AiDetectorSentence {
	offset: number
	length: number
	text: string
	suggestion?: string | null
	applied?: boolean
	dismissed?: boolean
}

export function editsFromSentences(sentences: readonly AiDetectorSentence[]): PendingEdit[] {
	return sentences
		.filter((sentence) => sentence.suggestion && !sentence.applied && !sentence.dismissed)
		.map((sentence) => ({
			offset: sentence.offset,
			length: sentence.length,
			replacement: sentence.suggestion as string,
		}))
}

export function computeAnalysisDiff(baseText: string, resultText: string): VersionDiffRange[] {
	if (baseText === resultText) return []
	return computeVersionDiff(baseText, resultText)
}
