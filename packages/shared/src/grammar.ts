import type { JobStatus } from './job'

export const SUGGESTION_CATEGORIES = ['grammar', 'style', 'spelling'] as const
export type SuggestionCategory = (typeof SUGGESTION_CATEGORIES)[number]

export const GRAMMAR_MODELS = ['standard', 'advanced', 'ai'] as const
export type GrammarModel = (typeof GRAMMAR_MODELS)[number]

/**
 * Satu usulan koreksi dari worker.
 *
 * `offset`/`length` bersifat opsional dan sering meleset 1-2 karakter pada
 * hasil LLM - web selalu menghitung ulang span dari `original`
 * (lihat `resolveSpan` di apps/web) dan memakai offset ini hanya sebagai hint.
 */
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

/** Payload lengkap hasil grammar check (dipakai polling `/status` & event `done`). */
export interface GrammarResultPayload {
	original_text: string
	corrected_text: string | null
	suggestions: GrammarSuggestion[]
	scores: GrammarScores | null
	writing_quality: number | null
	quality_label: string | null
}

/** Respons `GET /api/v1/status/:jobId` untuk job grammar. */
export interface GrammarJobStatus extends Partial<GrammarResultPayload> {
	jobId: string
	status: JobStatus
	title: string | null
	error?: string
}

/** Event SSE khusus job grammar - `checkpoint` = hasil parsial saat masih jalan. */
export type GrammarStreamEvent =
	| { type: 'checkpoint'; suggestions: GrammarSuggestion[] }
	| ({ type: 'done' } & GrammarResultPayload)
	| { type: 'error'; message: string }
	| { type: 'timeout' }
	| { type: 'ping' }
