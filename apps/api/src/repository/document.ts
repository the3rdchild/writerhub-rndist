import { and, desc, eq, sql } from 'drizzle-orm'
import db from '@/db'
import type { NewDocument } from '@/db/schemas'
import { documents, documentTabs, projects } from '@/db/schemas'

const tabCountFor = () => db.$count(documentTabs, eq(documentTabs.document_id, documents.id))

/** Posisi akhir satu halaman daftar dokumen; urutannya (updated_at, id) menurun. */
export interface DocumentCursor {
	updatedAt: Date
	id: string
}

/**
 * Dokumen milik satu identitas, terbaru lebih dulu.
 *
 * Tanpa `page`, seluruh daftar dikembalikan seperti sebelumnya. Dengan
 * `page`, hasilnya `limit + 1` baris sesudah `after`: baris kelebihan
 * menandakan masih ada halaman berikutnya, dan pemanggil yang membuangnya.
 */
export async function findDocumentsByOwner(
	ownerId: string,
	projectId?: string,
	page?: { limit: number; after?: DocumentCursor },
) {
	const conditions = [eq(projects.owner_id, ownerId)]
	if (projectId) conditions.push(eq(documents.project_id, projectId))
	if (page?.after) {
		conditions.push(
			sql`(${documents.updated_at}, ${documents.id}) < (${page.after.updatedAt.toISOString()}::timestamptz, ${page.after.id}::uuid)`,
		)
	}

	const query = db
		.select({
			id: documents.id,
			title: documents.title,
			projectId: documents.project_id,
			templateSlug: documents.template_slug,
			layout: documents.layout,
			metadata: documents.metadata,
			brief: documents.brief,
			tabCount: tabCountFor(),
			updatedAt: documents.updated_at,
			createdAt: documents.created_at,
		})
		.from(documents)
		.innerJoin(projects, eq(documents.project_id, projects.id))
		.where(and(...conditions))

	if (!page) return query.orderBy(desc(documents.updated_at))
	return query.orderBy(desc(documents.updated_at), desc(documents.id)).limit(page.limit + 1)
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

/**
 * Dokumen tanpa memeriksa pemiliknya.
 *
 * Hanya untuk jalur yang izinnya sudah diperiksa dengan cara lain - rute ekspor
 * memakai token bertanda tangan yang terikat ke id dokumen ini
 * (`lib/signed-url.ts`), jadi memegang tokennya SUDAH merupakan izinnya.
 * Jangan dipakai di jalur yang bersandar pada sesi.
 */
export async function findDocumentUnscoped(id: string) {
	const [row] = await db.select().from(documents).where(eq(documents.id, id)).limit(1)
	return row ?? null
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
