import type { JobStatus } from './job'

export const SUGGESTION_CATEGORIES = ['grammar', 'style', 'spelling'] as const
export type SuggestionCategory = (typeof SUGGESTION_CATEGORIES)[number]

export const GRAMMAR_MODELS = ['standard', 'advanced', 'ai'] as const
export type GrammarModel = (typeof GRAMMAR_MODELS)[number]

export interface GrammarSuggestion {
	id: string
	type: string
	category: SuggestionCategory
	original: string
	replacement: string
	offset?: number
	length?: number
}

export interface GrammarScores {
	grammar: number
	fluency: number
	clarity: number
	engagement: number
}

export interface GrammarResultPayload {
	original_text: string
	corrected_text: string | null
	suggestions: GrammarSuggestion[]
	scores: GrammarScores | null
	writing_quality: number | null
	quality_label: string | null
}

export interface GrammarJobStatus extends Partial<GrammarResultPayload> {
	jobId: string
	status: JobStatus
	title: string | null
	error?: string
}

export type GrammarStreamEvent =
	| { type: 'checkpoint'; suggestions: GrammarSuggestion[] }
	| ({ type: 'done' } & GrammarResultPayload)
	| { type: 'error'; message: string }
	| { type: 'timeout' }
	| { type: 'cancelled' }
	| { type: 'ping' }
