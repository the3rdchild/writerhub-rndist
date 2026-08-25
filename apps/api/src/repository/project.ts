import { and, count, desc, eq } from 'drizzle-orm'
import db from '@/db'
import { documents, projects } from '@/db/schemas'
import type { NewProject } from '@/db/schemas'
import { AppError } from '@/lib/error'

/**
 * Akses tabel `projects` yang selalu diskop ke pemilik (`owner_id`) -
 * proyek user lain tidak pernah terlihat lewat fungsi-fungsi ini.
 */

/**
 * Daftar proyek milik user beserta jumlah dokumen di dalamnya, yang terakhir
 * diubah di atas.
 *
 * `LEFT JOIN` + `count(documents.id)`, bukan `count(*)`: proyek kosong harus
 * tetap muncul dengan angka 0, dan `count(*)` akan menghitung baris hasil join
 * yang tetap ada satu meski dokumennya nihil.
 */
export async function findProjectsByOwner(ownerId: string) {
	return db
		.select({
			id: projects.id,
			owner_id: projects.owner_id,
			name: projects.name,
			color: projects.color,
			updated_at: projects.updated_at,
			created_at: projects.created_at,
			documentCount: count(documents.id),
		})
		.from(projects)
		.leftJoin(documents, eq(documents.project_id, projects.id))
		.where(eq(projects.owner_id, ownerId))
		.groupBy(projects.id)
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

const DEFAULT_PROJECT_NAME = 'Dokumen Saya'

/**
 * Proyek fallback tempat dokumen "tak berproyek" mendarat sejak setiap
 * dokumen wajib punya `project_id`. Dipakai backfill migrasi dan jalur
 * create-dokumen yang belum (atau tidak perlu) memilih proyek eksplisit.
 */
export async function findOrCreateDefaultProject(ownerId: string) {
	const [existing] = await db
		.select()
		.from(projects)
		.where(and(eq(projects.owner_id, ownerId), eq(projects.name, DEFAULT_PROJECT_NAME)))
		.limit(1)
	if (existing) return existing

	const [created] = await db
		.insert(projects)
		.values({ owner_id: ownerId, name: DEFAULT_PROJECT_NAME })
		.returning()
	if (!created) throw new Error('Gagal membuat proyek default')
	return created
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
 * Menghapus proyek. Setiap dokumen wajib punya proyek (`documents.project_id`
 * NOT NULL, ON DELETE RESTRICT) - proyek yang masih berisi dokumen tidak bisa
 * dihapus, user harus memindahkan/menghapus dokumennya dulu.
 */
export async function deleteProject(id: string, ownerId: string) {
	try {
		const [row] = await db
			.delete(projects)
			.where(and(eq(projects.id, id), eq(projects.owner_id, ownerId)))
			.returning({ id: projects.id })
		return row ?? null
	} catch (error) {
		if (error && typeof error === 'object' && 'code' in error && error.code === '23503') {
			throw AppError.conflict('Proyek masih berisi dokumen - pindahkan atau hapus dokumennya dulu')
		}
		throw error
	}
}
