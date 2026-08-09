import type {
	AnalysisFeature,
	AnalysisResultData,
	GrammarResultPayload,
	JobStatus,
} from '@writer-hub/shared'

/**
 * Aktivitas AI (fitur F): catatan pemakaian modul AI per user. `HistoryEntry`
 * dipakai daftar /activity (ringkasan saja), `HistoryDetail` membawa hasil
 * lengkapnya untuk panel detail.
 */
export type HistoryFeature = 'grammar' | AnalysisFeature

export interface HistoryEntry {
	jobId: string
	feature: HistoryFeature | null
	status: JobStatus
	/** null berarti job dijalankan dari tab lokal, atau dokumennya sudah dihapus. */
	documentId: string | null
	documentTitle: string | null
	/** Epoch milidetik (server mengirim `Date.getTime()`). */
	createdAt: number
	/** Ringkasan per fitur (skor/jumlah perubahan/label); null untuk job gagal. */
	summary: string | null
}

export interface HistoryListResponse {
	entries: HistoryEntry[]
	/** Kursor halaman berikutnya (epoch milidetik); null bila sudah habis. */
	nextCursor: number | null
}

export interface HistoryDetail extends HistoryEntry {
	error: string | null
	/** Shape-nya mengikuti fitur: GrammarResultPayload atau AnalysisResultData. */
	result: GrammarResultPayload | AnalysisResultData | null
}
