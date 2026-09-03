import { and, eq } from 'drizzle-orm'
import db from '@/db'
import { projects } from '@/db/schemas'

/**
 * Apakah identitas ini boleh mengakses proyek tersebut.
 *
 * Hari ini jawabannya "kalau ia pemiliknya", karena `projects` belum punya
 * tabel anggota. Fungsi ini tetap ada supaya jawabannya ditulis **satu kali**:
 * saat keanggotaan proyek ditambahkan nanti, yang berubah cuma isi fungsi ini,
 * bukan setiap tempat yang memeriksa izin. Aturan otorisasi yang tersebar di
 * banyak call site adalah cara paling umum sebuah tempat terlewat.
 */
export async function canAccessProject(identityId: string, projectId: string): Promise<boolean> {
	const [row] = await db
		.select({ id: projects.id })
		.from(projects)
		.where(and(eq(projects.id, projectId), eq(projects.owner_id, identityId)))
		.limit(1)
	return Boolean(row)
}

/** Proyek mana saja yang boleh diakses identitas ini. */
export async function accessibleProjectIds(identityId: string): Promise<string[]> {
	const rows = await db.select({ id: projects.id }).from(projects).where(eq(projects.owner_id, identityId))
	return rows.map((row) => row.id)
}
