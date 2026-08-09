import { and, desc, eq, lt, sql } from 'drizzle-orm'
import db from '@/db'
import { analysisResult, documents, grammarResult, poolRequest } from '@/db/schemas'

/**
 * Akses tabel `pool_request` (plus join hasilnya) untuk halaman Aktivitas AI,
 * selalu diskop ke pemilik (`user_id`). Baris lama dengan `user_id` NULL tidak
 * pernah terbaca lewat fungsi-fungsi ini - pemiliknya tidak diketahui.
 *
 * Lapisan ini sengaja terpisah dari route (mitigasi §5.4 dokumen gap): sumber
 * datanya bisa ditukar ke Core Platform PPE tanpa menyentuh route.
 */

/** Retensi aktivitas: entri lebih tua dari ini dihapus saat entri baru ditulis. */
export const HISTORY_RETENTION_DAYS = 90

export interface HistoryListFilter {
	feature?: string
	documentId?: string
	limit: number
	/** Keyset pagination: hanya baris dengan created_at SEBELUM kursor ini. */
	cursor?: Date
}

// Ringkasan dirakit di SQL supaya jsonb hasil (bisa ratusan kilobita untuk satu
// dokumen panjang) tidak ikut terkirim hanya untuk daftar.
const suggestionCount = sql<number>`jsonb_array_length(coalesce(${grammarResult.suggestions}, '[]'::jsonb))`
const analysisChangeCount = sql<number | null>`CASE
	WHEN ${analysisResult.result} ? 'changes' THEN jsonb_array_length(${analysisResult.result}->'changes')
	ELSE NULL
END`
const analysisLabel = sql<string | null>`${analysisResult.result}->>'label'`
// overall_score untuk ai_detector, uniqueness_score untuk plagiarism.
const analysisScore = sql<string | null>`coalesce(
	${analysisResult.result}->>'overall_score',
	${analysisResult.result}->>'uniqueness_score'
)`

/** Daftar aktivitas milik user (ringkasan saja), terbaru di atas. */
export async function findHistoryByUser(userId: string, filter: HistoryListFilter) {
	const conditions = [eq(poolRequest.user_id, userId)]
	if (filter.feature) conditions.push(eq(poolRequest.feature, filter.feature))
	if (filter.documentId) conditions.push(eq(poolRequest.document_id, filter.documentId))
	if (filter.cursor) conditions.push(lt(poolRequest.created_at, filter.cursor))

	return db
		.select({
			jobId: poolRequest.job_id,
			status: poolRequest.status,
			feature: poolRequest.feature,
			documentId: poolRequest.document_id,
			documentTitle: documents.title,
			createdAt: poolRequest.created_at,
			grammarScore: grammarResult.writing_quality,
			grammarLabel: grammarResult.quality_label,
			suggestionCount,
			analysisChangeCount,
			analysisLabel,
			analysisScore,
		})
		.from(poolRequest)
		.leftJoin(documents, eq(poolRequest.document_id, documents.id))
		.leftJoin(grammarResult, eq(grammarResult.job_id, poolRequest.job_id))
		.leftJoin(analysisResult, eq(analysisResult.job_id, poolRequest.job_id))
		.where(and(...conditions))
		.orderBy(desc(poolRequest.created_at))
		.limit(filter.limit)
}

/** Satu entri lengkap beserta baris hasilnya (grammar atau analysis). */
export async function findHistoryEntry(userId: string, jobId: string) {
	const [row] = await db
		.select({
			request: poolRequest,
			documentTitle: documents.title,
			grammar: grammarResult,
			analysis: analysisResult,
		})
		.from(poolRequest)
		.leftJoin(documents, eq(poolRequest.document_id, documents.id))
		.leftJoin(grammarResult, eq(grammarResult.job_id, poolRequest.job_id))
		.leftJoin(analysisResult, eq(analysisResult.job_id, poolRequest.job_id))
		.where(and(eq(poolRequest.user_id, userId), eq(poolRequest.job_id, jobId)))
		.limit(1)
	return row ?? null
}

/**
 * Hapus satu entri milik user. grammar_result/analysis_result ikut terhapus
 * lewat ON DELETE CASCADE pada request_id - sudah dicek di skema.
 */
export async function deleteHistoryEntry(userId: string, jobId: string) {
	const [row] = await db
		.delete(poolRequest)
		.where(and(eq(poolRequest.user_id, userId), eq(poolRequest.job_id, jobId)))
		.returning({ id: poolRequest.id })
	return row !== undefined
}

/** Hapus SELURUH aktivitas milik user ("Hapus semua aktivitas"). */
export async function deleteAllHistoryForUser(userId: string) {
	const rows = await db
		.delete(poolRequest)
		.where(eq(poolRequest.user_id, userId))
		.returning({ id: poolRequest.id })
	return rows.length
}

/**
 * Pangkas entri user yang lebih tua dari retensi. Dipanggil saat entri baru
 * ditulis (pola `pruneIntervalVersions` di fitur I) sehingga tidak butuh cron.
 * Hanya baris milik user ini yang disentuh; baris anonim lama dibiarkan.
 */
export async function pruneOldHistory(userId: string, retentionDays = HISTORY_RETENTION_DAYS) {
	const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60_000)
	return db
		.delete(poolRequest)
		.where(and(eq(poolRequest.user_id, userId), lt(poolRequest.created_at, cutoff)))
}
