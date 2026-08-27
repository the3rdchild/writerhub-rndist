import { and, desc, eq, inArray, sql } from 'drizzle-orm'
import db from '@/db'
import type { NewDocumentVersion } from '@/db/schemas'
import { documentVersions, metadataVersion } from '@/db/schemas'

/**
 * Jumlah versi otomatis per tab yang dipertahankan; selebihnya dipangkas tiap
 * kali tab disimpan. Hanya berlaku untuk trigger 'interval' - versi manual,
 * pra-restore dan hasil AI tidak pernah ikut dipangkas.
 */
export const INTERVAL_VERSIONS_KEPT = 50

export async function findVersionsByTab(tabId: string) {
	return db
		.select({
			id: documentVersions.id,
			trigger: documentVersions.trigger,
			label: documentVersions.label,
			wordCount: documentVersions.word_count,
			createdAt: documentVersions.created_at,
			feature: metadataVersion.feature,
		})
		.from(documentVersions)
		.leftJoin(metadataVersion, eq(metadataVersion.version_id, documentVersions.id))
		.where(eq(documentVersions.tab_id, tabId))
		.orderBy(desc(documentVersions.created_at))
}

export async function findVersionById(versionId: string, tabId: string) {
	const [row] = await db
		.select({
			id: documentVersions.id,
			tab_id: documentVersions.tab_id,
			content: documentVersions.content,
			trigger: documentVersions.trigger,
			label: documentVersions.label,
			word_count: documentVersions.word_count,
			created_by: documentVersions.created_by,
			created_at: documentVersions.created_at,
			feature: metadataVersion.feature,
		})
		.from(documentVersions)
		.leftJoin(metadataVersion, eq(metadataVersion.version_id, documentVersions.id))
		.where(and(eq(documentVersions.id, versionId), eq(documentVersions.tab_id, tabId)))
		.limit(1)
	return row ?? null
}

export async function insertVersion(values: NewDocumentVersion) {
	const [row] = await db.insert(documentVersions).values(values).returning()
	return row ?? null
}

export async function findLatestVersion(tabId: string) {
	const [row] = await db
		.select({ id: documentVersions.id, createdAt: documentVersions.created_at })
		.from(documentVersions)
		.where(eq(documentVersions.tab_id, tabId))
		.orderBy(desc(documentVersions.created_at))
		.limit(1)
	return row ?? null
}

export async function versionContentEquals(
	versionId: string,
	content: Record<string, unknown>,
): Promise<boolean> {
	const [row] = await db
		.select({ id: documentVersions.id })
		.from(documentVersions)
		.where(
			and(
				eq(documentVersions.id, versionId),
				sql`${documentVersions.content} = ${JSON.stringify(content)}::jsonb`,
			),
		)
		.limit(1)
	return row !== undefined
}

export async function pruneIntervalVersions(tabId: string, keep = INTERVAL_VERSIONS_KEPT) {
	const stale = db
		.select({ id: documentVersions.id })
		.from(documentVersions)
		.where(and(eq(documentVersions.tab_id, tabId), eq(documentVersions.trigger, 'interval')))
		.orderBy(desc(documentVersions.created_at))
		.offset(keep)

	return db
		.delete(documentVersions)
		.where(
			and(
				eq(documentVersions.tab_id, tabId),
				eq(documentVersions.trigger, 'interval'),
				inArray(documentVersions.id, stale),
			),
		)
}
