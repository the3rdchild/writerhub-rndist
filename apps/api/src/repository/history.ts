import { and, desc, eq, inArray, lt, sql } from 'drizzle-orm'
import db from '@/db'
import { documents, documentTabs, documentVersions, metadataVersion, poolRequest } from '@/db/schemas'

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
	/** Filter per tab (`pool_request.tab_id`). */
	tabId?: string
	limit: number
	/** Keyset pagination: hanya baris dengan created_at SEBELUM kursor ini. */
	cursor?: Date
}

// Ringkasan dirakit di SQL supaya jsonb hasil (bisa ratusan kilobita untuk satu
// dokumen panjang) tidak ikut terkirim hanya untuk daftar. `result` sekarang
// generik (metadata_version) - grammar dan analysis dibedakan lewat `feature`.
const suggestionCount = sql<number | null>`CASE
	WHEN ${metadataVersion.feature} = 'grammar'
	THEN jsonb_array_length(coalesce(${metadataVersion.result}->'suggestions', '[]'::jsonb))
	ELSE NULL
END`
const grammarScore = sql<number | null>`CASE
	WHEN ${metadataVersion.feature} = 'grammar'
	THEN (${metadataVersion.result}->>'writing_quality')::int
	ELSE NULL
END`
const grammarLabel = sql<string | null>`CASE
	WHEN ${metadataVersion.feature} = 'grammar'
	THEN ${metadataVersion.result}->>'quality_label'
	ELSE NULL
END`
const analysisChangeCount = sql<number | null>`CASE
	WHEN ${metadataVersion.feature} != 'grammar' AND ${metadataVersion.result} ? 'changes'
	THEN jsonb_array_length(${metadataVersion.result}->'changes')
	ELSE NULL
END`
const analysisLabel = sql<string | null>`CASE
	WHEN ${metadataVersion.feature} != 'grammar' THEN ${metadataVersion.result}->>'label'
	ELSE NULL
END`
// overall_score untuk ai_detector, uniqueness_score untuk plagiarism.
const analysisScore = sql<string | null>`CASE
	WHEN ${metadataVersion.feature} != 'grammar' THEN coalesce(
		${metadataVersion.result}->>'overall_score',
		${metadataVersion.result}->>'uniqueness_score'
	)
	ELSE NULL
END`

/** Daftar aktivitas milik user (ringkasan saja), terbaru di atas. */
export async function findHistoryByUser(userId: string, filter: HistoryListFilter) {
	const conditions = [eq(poolRequest.user_id, userId)]
	if (filter.feature) conditions.push(eq(poolRequest.feature, filter.feature))
	if (filter.tabId) conditions.push(eq(poolRequest.tab_id, filter.tabId))
	if (filter.cursor) conditions.push(lt(poolRequest.created_at, filter.cursor))

	// Judul yang ditampilkan adalah judul DOKUMEN INDUK (plan §7 baris F):
	// pool_request.tab_id -> document_tabs -> documents. Tab yang sudah dihapus
	// menghasilkan judul null (tautannya di-SET NULL).
	return db
		.select({
			jobId: poolRequest.job_id,
			status: poolRequest.status,
			feature: poolRequest.feature,
			tabId: poolRequest.tab_id,
			documentTitle: documents.title,
			createdAt: poolRequest.created_at,
			grammarScore,
			grammarLabel,
			suggestionCount,
			analysisChangeCount,
			analysisLabel,
			analysisScore,
		})
		.from(poolRequest)
		.leftJoin(documentTabs, eq(poolRequest.tab_id, documentTabs.id))
		.leftJoin(documents, eq(documentTabs.document_id, documents.id))
		.leftJoin(metadataVersion, eq(metadataVersion.job_id, poolRequest.job_id))
		.where(and(...conditions))
		.orderBy(desc(poolRequest.created_at))
		.limit(filter.limit)
}

/** Satu entri lengkap beserta baris hasilnya (metadata_version). */
export async function findHistoryEntry(userId: string, jobId: string) {
	const [row] = await db
		.select({
			request: poolRequest,
			documentTitle: documents.title,
			result: metadataVersion,
		})
		.from(poolRequest)
		.leftJoin(documentTabs, eq(poolRequest.tab_id, documentTabs.id))
		.leftJoin(documents, eq(documentTabs.document_id, documents.id))
		.leftJoin(metadataVersion, eq(metadataVersion.job_id, poolRequest.job_id))
		.where(and(eq(poolRequest.user_id, userId), eq(poolRequest.job_id, jobId)))
		.limit(1)
	return row ?? null
}

/**
 * Hapus baris `pool_request` (metadata_version ikut lewat ON DELETE CASCADE
 * pada request_id) PLUS `document_versions` (trigger `ai_result`) yang jadi
 * anchor-nya - FK `metadata_version.version_id` cuma cascade satu arah
 * (dokumen versi dihapus -> metadata_version ikut hilang), bukan sebaliknya,
 * jadi versi berkonten-penuh itu perlu dihapus manual di sini. Tanpa ini,
 * versi `ai_result` jadi sampah permanen di `document_versions` setiap kali
 * histori aktivitasnya dihapus/dipangkas - lihat catatan di document-version.ts.
 */
async function deletePoolRequests(ids: string[]): Promise<number> {
	if (ids.length === 0) return 0

	return db.transaction(async (tx) => {
		const orphaned = await tx
			.select({ versionId: metadataVersion.version_id })
			.from(metadataVersion)
			.where(inArray(metadataVersion.request_id, ids))

		await tx.delete(poolRequest).where(inArray(poolRequest.id, ids))

		if (orphaned.length > 0) {
			await tx.delete(documentVersions).where(
				inArray(
					documentVersions.id,
					orphaned.map((row) => row.versionId),
				),
			)
		}

		return ids.length
	})
}

/** Hapus satu entri milik user. */
export async function deleteHistoryEntry(userId: string, jobId: string): Promise<boolean> {
	const [target] = await db
		.select({ id: poolRequest.id })
		.from(poolRequest)
		.where(and(eq(poolRequest.user_id, userId), eq(poolRequest.job_id, jobId)))
		.limit(1)
	if (!target) return false

	await deletePoolRequests([target.id])
	return true
}

/** Hapus SELURUH aktivitas milik user ("Hapus semua aktivitas"). */
export async function deleteAllHistoryForUser(userId: string): Promise<number> {
	const rows = await db.select({ id: poolRequest.id }).from(poolRequest).where(eq(poolRequest.user_id, userId))
	return deletePoolRequests(rows.map((row) => row.id))
}

/**
 * Pangkas entri user yang lebih tua dari retensi. Dipanggil saat entri baru
 * ditulis (pola `pruneIntervalVersions` di fitur I) sehingga tidak butuh cron.
 * Hanya baris milik user ini yang disentuh; baris anonim lama dibiarkan.
 */
export async function pruneOldHistory(userId: string, retentionDays = HISTORY_RETENTION_DAYS): Promise<void> {
	const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60_000)
	const rows = await db
		.select({ id: poolRequest.id })
		.from(poolRequest)
		.where(and(eq(poolRequest.user_id, userId), lt(poolRequest.created_at, cutoff)))
	await deletePoolRequests(rows.map((row) => row.id))
}
