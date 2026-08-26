import { ANALYSIS_FEATURES, RESEARCH_FEATURE } from '@writer-hub/shared'
import type {
	AnalysisResultData,
	GrammarResultPayload,
	JobStatus,
	ResearchResultPayload,
} from '@writer-hub/shared'
import { z } from 'zod'
export const HISTORY_FEATURES = ['grammar', RESEARCH_FEATURE, ...ANALYSIS_FEATURES] as const
export type HistoryFeature = (typeof HISTORY_FEATURES)[number]

export const historyListQuerySchema = z.object({
	feature: z.enum(HISTORY_FEATURES).optional(),
	tabId: z.uuid().optional(),
	limit: z.coerce.number().int().min(1).max(100).optional().default(50),
	cursor: z.coerce.number().int().positive().optional(),
})
export interface HistorySummary {
	jobId: string
	feature: HistoryFeature | null
	status: JobStatus
	tabId: string | null
	documentTitle: string | null
	createdAt: number
	summary: string | null
}
export interface HistoryDetail extends HistorySummary {
	error: string | null
	result: GrammarResultPayload | AnalysisResultData | ResearchResultPayload | null
}

export interface HistoryListResponse {
	entries: HistorySummary[]
	nextCursor: number | null
}
