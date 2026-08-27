import { and, desc, eq } from 'drizzle-orm'
import db from '@/db'
import type { NewDocument } from '@/db/schemas'
import { documents, documentTabs, projects } from '@/db/schemas'

const tabCountFor = () => db.$count(documentTabs, eq(documentTabs.document_id, documents.id))

export async function findDocumentsByOwner(ownerId: string, projectId?: string) {
	const conditions = [eq(projects.owner_id, ownerId)]
	if (projectId) conditions.push(eq(documents.project_id, projectId))

	return db
		.select({
			id: documents.id,
			title: documents.title,
			projectId: documents.project_id,
			tabCount: tabCountFor(),
			updatedAt: documents.updated_at,
			createdAt: documents.created_at,
		})
		.from(documents)
		.innerJoin(projects, eq(documents.project_id, projects.id))
		.where(and(...conditions))
		.orderBy(desc(documents.updated_at))
}

export async function findDocumentById(id: string, ownerId: string) {
	const [row] = await db
		.select({ document: documents })
		.from(documents)
		.innerJoin(projects, eq(documents.project_id, projects.id))
		.where(and(eq(documents.id, id), eq(projects.owner_id, ownerId)))
		.limit(1)
	return row?.document ?? null
}

export async function insertDocument(values: NewDocument) {
	const [row] = await db.insert(documents).values(values).returning()
	return row ?? null
}

export async function updateDocument(id: string, ownerId: string, values: Partial<NewDocument>) {
	const owned = await findDocumentById(id, ownerId)
	if (!owned) return null

	const [row] = await db.update(documents).set(values).where(eq(documents.id, id)).returning()
	return row ?? null
}

export async function touchDocument(id: string) {
	await db.update(documents).set({ updated_at: new Date() }).where(eq(documents.id, id))
}

export async function deleteDocument(id: string, ownerId: string) {
	const owned = await findDocumentById(id, ownerId)
	if (!owned) return null

	const [row] = await db.delete(documents).where(eq(documents.id, id)).returning({ id: documents.id })
	return row ?? null
}
