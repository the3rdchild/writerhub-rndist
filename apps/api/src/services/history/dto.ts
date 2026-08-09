import { ANALYSIS_FEATURES } from '@writer-hub/shared'
import type { AnalysisResultData, GrammarResultPayload, JobStatus } from '@writer-hub/shared'
import { z } from 'zod'

/** Fitur yang tercatat di Aktivitas AI: grammar plus seluruh fitur analisis. */
export const HISTORY_FEATURES = ['grammar', ...ANALYSIS_FEATURES] as const
export type HistoryFeature = (typeof HISTORY_FEATURES)[number]

export const historyListQuerySchema = z.object({
	feature: z.enum(HISTORY_FEATURES).optional(),
	documentId: z.uuid().optional(),
	limit: z.coerce.number().int().min(1).max(100).optional().default(50),
	/** Kursor keyset: epoch milidetik created_at entri terakhir halaman sebelumnya. */
	cursor: z.coerce.number().int().positive().optional(),
})

/** Satu baris daftar: ringkasan saja, tanpa hasil penuh. */
export interface HistorySummary {
	jobId: string
	feature: HistoryFeature | null
	status: JobStatus
	documentId: string | null
	documentTitle: string | null
	/** Epoch milidetik (konvensi yang sama dengan API dokumen). */
	createdAt: number
	/** Ringkasan per fitur (skor/jumlah perubahan/label); null untuk job gagal. */
	summary: string | null
}

/** Detail satu entri: hasil lengkap ikut dimuat. */
export interface HistoryDetail extends HistorySummary {
	error: string | null
	/** Shape-nya mengikuti fitur: GrammarResultPayload atau AnalysisResultData. */
	result: GrammarResultPayload | AnalysisResultData | null
}

export interface HistoryListResponse {
	entries: HistorySummary[]
	/** Epoch milidetik untuk halaman berikutnya; null bila sudah habis. */
	nextCursor: number | null
}
