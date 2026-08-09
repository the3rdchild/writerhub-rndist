import { and, desc, eq, isNull } from 'drizzle-orm'
import db from '@/db'
import { documents } from '@/db/schemas'
import type { NewDocument } from '@/db/schemas'

/**
 * Akses tabel `documents` yang selalu diskop ke pemilik (`owner_id`) —
 * dokumen user lain tidak pernah terlihat lewat fungsi-fungsi ini.
 */

/**
 * Metadata list dokumen milik user, terbaru di atas.
 * `projectId` menyaring per proyek; nilai khusus `'none'` berarti hanya
 * dokumen yang belum berproyek.
 */
export async function findDocumentsByOwner(ownerId: string, projectId?: string) {
	const conditions = [eq(documents.owner_id, ownerId)]
	if (projectId === 'none') conditions.push(isNull(documents.project_id))
	else if (projectId) conditions.push(eq(documents.project_id, projectId))

	return db
		.select({
			id: documents.id,
			title: documents.title,
			emoji: documents.emoji,
			language: documents.language,
			projectId: documents.project_id,
			updatedAt: documents.updated_at,
			createdAt: documents.created_at,
		})
		.from(documents)
		.where(and(...conditions))
		.orderBy(desc(documents.updated_at))
}

export async function findDocumentById(id: string, ownerId: string) {
	const [row] = await db
		.select()
		.from(documents)
		.where(and(eq(documents.id, id), eq(documents.owner_id, ownerId)))
		.limit(1)
	return row ?? null
}

export async function insertDocument(values: NewDocument) {
	const [row] = await db.insert(documents).values(values).returning()
	return row ?? null
}

/** Menimpa field yang dikirim; `updated_at` otomatis via `$onUpdateFn`. */
export async function updateDocument(id: string, ownerId: string, values: Partial<NewDocument>) {
	const [row] = await db
		.update(documents)
		.set(values)
		.where(and(eq(documents.id, id), eq(documents.owner_id, ownerId)))
		.returning()
	return row ?? null
}

export async function deleteDocument(id: string, ownerId: string) {
	const [row] = await db
		.delete(documents)
		.where(and(eq(documents.id, id), eq(documents.owner_id, ownerId)))
		.returning({ id: documents.id })
	return row ?? null
}
