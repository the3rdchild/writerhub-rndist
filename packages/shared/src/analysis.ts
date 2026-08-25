import type { JobStatus } from './job'

export const ANALYSIS_FEATURES = [
	'ai_detector',
	'ai_rewriter',
	'humanizer',
	'plagiarism',
	'translator',
	'glossary',
] as const
export type AnalysisFeature = (typeof ANALYSIS_FEATURES)[number]
export const REWRITE_TONES = [
	{ id: 'academic', label: 'Akademik', instruction: 'academic and scholarly' },
	{ id: 'formal', label: 'Formal', instruction: 'formal and professional' },
	{ id: 'casual', label: 'Santai', instruction: 'casual and conversational' },
	{
		id: 'natural',
		label: 'Lebih natural',
		instruction: 'natural and human-like, as if written by a person rather than an AI',
	},
] as const
export type RewriterTone = (typeof REWRITE_TONES)[number]['id']
export const REWRITE_TONE_IDS = REWRITE_TONES.map((tone) => tone.id) as [RewriterTone, ...RewriterTone[]]

export interface StyleMemory {
	tone?: string
	language?: string
	glossary?: string[]
	notes?: string
}
export interface TextRange {
	offset: number
	length: number
}
export interface TextChange extends TextRange {
	original: string
	replacement: string
	candidates?: string[]
}

export interface AiDetectorResult {
	overall_score: number
	label: 'Human' | 'Mixed' | 'AI-Generated'
	sentences: Array<TextRange & { text: string; score: number; suggestion?: string | null }>
}

export interface AiRewriterResult {
	rewritten_text: string
	changes: TextChange[]
	llm_unavailable?: boolean
}

export interface HumanizerResult {
	humanized_text: string
	changes_count: number
	changes: TextChange[]
	llm_unavailable?: boolean
}
export interface TranslatorResult {
	translated_text: string
	changes: TextChange[]
	detected_language?: string
	llm_unavailable?: boolean
}
export interface GlossaryEntry {
	term: string
	expansion?: string
	definition: string
	occurrences: number
	source?: 'acronym' | 'phrase'
}
export interface GlossaryResult {
	entries: GlossaryEntry[]
	llm_unavailable?: boolean
}

export interface PlagiarismResult {
	uniqueness_score: number
	label: 'Unique' | 'Likely Original' | 'Possible Match' | 'High Similarity'
	flagged_phrases: Array<TextRange & { text: string; similarity: number }>
}
export interface AnalysisResultMap {
	ai_detector: AiDetectorResult
	ai_rewriter: AiRewriterResult
	humanizer: HumanizerResult
	plagiarism: PlagiarismResult
	translator: TranslatorResult
	glossary: GlossaryResult
}

export type AnalysisResultFor<F extends AnalysisFeature> = AnalysisResultMap[F]
export type AnalysisResultData = AnalysisResultMap[AnalysisFeature]
export interface AnalysisJobStatus<F extends AnalysisFeature = AnalysisFeature> {
	jobId: string
	status: JobStatus
	title: string | null
	error?: string
	feature?: F
	result?: AnalysisResultFor<F>
}
export type AnalysisStreamEvent<F extends AnalysisFeature = AnalysisFeature> =
	| { type: 'done'; result: AnalysisResultFor<F> }
	| { type: 'error'; message: string }
	| { type: 'timeout' }
	| { type: 'cancelled' }
	| { type: 'ping' }
