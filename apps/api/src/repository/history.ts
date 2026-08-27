import { and, desc, eq, inArray, lt, sql } from 'drizzle-orm'
import { MS_PER_DAY } from '@/constants/time'
import db from '@/db'
import { documents, documentTabs, documentVersions, metadataVersion, poolRequest } from '@/db/schemas'
export const HISTORY_RETENTION_DAYS = 90

export interface HistoryListFilter {
	feature?: string
	tabId?: string
	limit: number
	cursor?: Date
}

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

const researchSourceCount = sql<number | null>`CASE
	WHEN ${metadataVersion.feature} = 'research'
	THEN jsonb_array_length(coalesce(${metadataVersion.result}->'sources', '[]'::jsonb))
	ELSE NULL
END`

const analysisLabel = sql<string | null>`CASE
	WHEN ${metadataVersion.feature} != 'grammar' THEN ${metadataVersion.result}->>'label'
	ELSE NULL
END`

const analysisScore = sql<string | null>`CASE
	WHEN ${metadataVersion.feature} != 'grammar' THEN coalesce(
		${metadataVersion.result}->>'overall_score',
		${metadataVersion.result}->>'uniqueness_score'
	)
	ELSE NULL
END`

export async function findHistoryByUser(userId: string, filter: HistoryListFilter) {
	const conditions = [eq(poolRequest.user_id, userId)]
	if (filter.feature) conditions.push(eq(poolRequest.feature, filter.feature))
	if (filter.tabId) conditions.push(eq(poolRequest.tab_id, filter.tabId))
	if (filter.cursor) conditions.push(lt(poolRequest.created_at, filter.cursor))
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
			researchSourceCount,
		})
		.from(poolRequest)
		.leftJoin(documentTabs, eq(poolRequest.tab_id, documentTabs.id))
		.leftJoin(documents, eq(documentTabs.document_id, documents.id))
		.leftJoin(metadataVersion, eq(metadataVersion.job_id, poolRequest.job_id))
		.where(and(...conditions))
		.orderBy(desc(poolRequest.created_at))
		.limit(filter.limit)
}

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

async function deletePoolRequests(ids: string[]): Promise<number> {
	if (ids.length === 0) return 0

	return db.transaction(async (tx) => {
		const orphaned = await tx
			.select({ versionId: metadataVersion.version_id })
			.from(metadataVersion)
			.where(inArray(metadataVersion.request_id, ids))

		await tx.delete(poolRequest).where(inArray(poolRequest.id, ids))

		// Riset web tidak punya versi dokumen - version_id-nya NULL dan tidak
		// boleh ikut masuk daftar hapus.
		const versionIds = orphaned
			.map((row) => row.versionId)
			.filter((versionId): versionId is string => versionId !== null)

		if (versionIds.length > 0) {
			await tx.delete(documentVersions).where(inArray(documentVersions.id, versionIds))
		}

		return ids.length
	})
}

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

export async function deleteAllHistoryForUser(userId: string): Promise<number> {
	const rows = await db
		.select({ id: poolRequest.id })
		.from(poolRequest)
		.where(eq(poolRequest.user_id, userId))
	return deletePoolRequests(rows.map((row) => row.id))
}

export async function pruneOldHistory(userId: string, retentionDays = HISTORY_RETENTION_DAYS): Promise<void> {
	const cutoff = new Date(Date.now() - retentionDays * MS_PER_DAY)
	const rows = await db
		.select({ id: poolRequest.id })
		.from(poolRequest)
		.where(and(eq(poolRequest.user_id, userId), lt(poolRequest.created_at, cutoff)))
	await deletePoolRequests(rows.map((row) => row.id))
}
