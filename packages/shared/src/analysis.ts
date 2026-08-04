import type { JobStatus } from './job'

export const ANALYSIS_FEATURES = ['ai_detector', 'ai_rewriter', 'humanizer', 'plagiarism'] as const
export type AnalysisFeature = (typeof ANALYSIS_FEATURES)[number]

/** Rentang karakter pada teks sumber - dipakai highlight & apply. */
export interface TextRange {
	offset: number
	length: number
}

/** Perubahan teks yang bisa di-accept/dismiss per segmen. */
export interface TextChange extends TextRange {
	original: string
	replacement: string
}

export interface AiDetectorResult {
	overall_score: number
	label: 'Human' | 'Mixed' | 'AI-Generated'
	sentences: Array<TextRange & { text: string; score: number; suggestion?: string | null }>
}

export interface AiRewriterResult {
	rewritten_text: string
	changes: TextChange[]
}

export interface HumanizerResult {
	humanized_text: string
	changes_count: number
	changes: TextChange[]
}

export interface PlagiarismResult {
	uniqueness_score: number
	label: 'Unique' | 'Likely Original' | 'Possible Match' | 'High Similarity'
	flagged_phrases: Array<TextRange & { text: string; similarity: number }>
}

/** Peta feature → shape hasilnya. Sumber kebenaran untuk tipe hasil analisis. */
export interface AnalysisResultMap {
	ai_detector: AiDetectorResult
	ai_rewriter: AiRewriterResult
	humanizer: HumanizerResult
	plagiarism: PlagiarismResult
}

export type AnalysisResultFor<F extends AnalysisFeature> = AnalysisResultMap[F]
export type AnalysisResultData = AnalysisResultMap[AnalysisFeature]

/** Respons `GET /api/v1/status/:jobId` untuk job analisis. */
export interface AnalysisJobStatus<F extends AnalysisFeature = AnalysisFeature> {
	jobId: string
	status: JobStatus
	title: string | null
	error?: string
	feature?: F
	result?: AnalysisResultFor<F>
}

/** Event SSE job analisis - hasil datang sekaligus di event `done`. */
export type AnalysisStreamEvent<F extends AnalysisFeature = AnalysisFeature> =
	| { type: 'done'; result: AnalysisResultFor<F> }
	| { type: 'error'; message: string }
	| { type: 'timeout' }
	| { type: 'ping' }
