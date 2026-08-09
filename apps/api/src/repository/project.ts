import { and, desc, eq } from 'drizzle-orm'
import db from '@/db'
import { projects } from '@/db/schemas'
import type { NewProject } from '@/db/schemas'

/**
 * Akses tabel `projects` yang selalu diskop ke pemilik (`owner_id`) —
 * proyek user lain tidak pernah terlihat lewat fungsi-fungsi ini.
 */

/** Daftar proyek milik user, yang terakhir diubah di atas. */
export async function findProjectsByOwner(ownerId: string) {
	return db
		.select()
		.from(projects)
		.where(eq(projects.owner_id, ownerId))
		.orderBy(desc(projects.updated_at))
}

export async function findProjectById(id: string, ownerId: string) {
	const [row] = await db
		.select()
		.from(projects)
		.where(and(eq(projects.id, id), eq(projects.owner_id, ownerId)))
		.limit(1)
	return row ?? null
}

export async function insertProject(values: NewProject) {
	const [row] = await db.insert(projects).values(values).returning()
	return row ?? null
}

/** Menimpa field yang dikirim; `updated_at` otomatis via `$onUpdateFn`. */
export async function updateProject(id: string, ownerId: string, values: Partial<NewProject>) {
	const [row] = await db
		.update(projects)
		.set(values)
		.where(and(eq(projects.id, id), eq(projects.owner_id, ownerId)))
		.returning()
	return row ?? null
}

/**
 * Menghapus proyek saja. Dokumen di dalamnya selamat: FK `documents.project_id`
 * memakai ON DELETE SET NULL sehingga mereka kembali ke "Tanpa proyek".
 */
export async function deleteProject(id: string, ownerId: string) {
	const [row] = await db
		.delete(projects)
		.where(and(eq(projects.id, id), eq(projects.owner_id, ownerId)))
		.returning({ id: projects.id })
	return row ?? null
}
