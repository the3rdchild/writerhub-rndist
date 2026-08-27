import { and, asc, count, eq, sql } from 'drizzle-orm'
import db from '@/db'
import { documents, documentTabs, projects } from '@/db/schemas'
import type { NewDocumentTab } from '@/db/schemas'

export async function findTabsByDocument(documentId: string) {
	return db
		.select()
		.from(documentTabs)
		.where(eq(documentTabs.document_id, documentId))
		.orderBy(asc(documentTabs.position))
}

export async function findTabById(tabId: string, ownerId: string) {
	const [row] = await db
		.select({ tab: documentTabs })
		.from(documentTabs)
		.innerJoin(documents, eq(documentTabs.document_id, documents.id))
		.innerJoin(projects, and(eq(documents.project_id, projects.id), eq(projects.owner_id, ownerId)))
		.where(eq(documentTabs.id, tabId))
		.limit(1)
	return row?.tab ?? null
}

export async function insertTab(values: NewDocumentTab) {
	const [row] = await db.insert(documentTabs).values(values).returning()
	return row ?? null
}

export async function updateTab(tabId: string, values: Partial<NewDocumentTab>) {
	const [row] = await db.update(documentTabs).set(values).where(eq(documentTabs.id, tabId)).returning()
	return row ?? null
}

export async function deleteTab(tabId: string) {
	const [row] = await db
		.delete(documentTabs)
		.where(eq(documentTabs.id, tabId))
		.returning({ id: documentTabs.id })
	return row ?? null
}

export async function countTabs(documentId: string): Promise<number> {
	const [row] = await db
		.select({ value: count() })
		.from(documentTabs)
		.where(eq(documentTabs.document_id, documentId))
	return row?.value ?? 0
}

export async function nextTabPosition(documentId: string): Promise<number> {
	const [row] = await db
		.select({ max: sql<number | null>`max(${documentTabs.position})` })
		.from(documentTabs)
		.where(eq(documentTabs.document_id, documentId))
	return (row?.max ?? -1) + 1
}

export async function reorderTabs(tabIds: string[]): Promise<void> {
	await db.transaction(async (tx) => {
		for (const [position, tabId] of tabIds.entries()) {
			await tx.update(documentTabs).set({ position }).where(eq(documentTabs.id, tabId))
		}
	})
}
