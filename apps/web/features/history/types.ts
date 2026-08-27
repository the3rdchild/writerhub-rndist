import type {
	AnalysisFeature,
	AnalysisResultData,
	GrammarResultPayload,
	JobStatus,
	ResearchResultPayload,
} from '@writer-hub/shared'

export type HistoryFeature = 'grammar' | 'research' | AnalysisFeature

export interface HistoryEntry {
	jobId: string
	feature: HistoryFeature | null
	status: JobStatus
	tabId: string | null
	documentTitle: string | null
	createdAt: number
	summary: string | null
}

export interface HistoryListResponse {
	entries: HistoryEntry[]
	nextCursor: number | null
}

export interface HistoryDetail extends HistoryEntry {
	error: string | null
	result: GrammarResultPayload | AnalysisResultData | ResearchResultPayload | null
}
