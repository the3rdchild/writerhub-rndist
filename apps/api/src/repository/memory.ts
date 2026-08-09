import { eq } from 'drizzle-orm'
import type { StyleMemory } from '@writer-hub/shared'
import db from '@/db'
import { userMemories } from '@/db/schemas'

/**
 * Akses tabel `user_memories` yang selalu diskop ke pemilik (`owner_id`) —
 * satu baris per user, preferensi tersimpan sebagai satu objek jsonb.
 */

/** Baca AI Memory milik user; null bila belum pernah diisi. */
export async function findMemoryByOwner(ownerId: string) {
	const [row] = await db
		.select()
		.from(userMemories)
		.where(eq(userMemories.owner_id, ownerId))
		.limit(1)
	return row ?? null
}

/**
 * Upsert preferensi user. Menimpa SELURUH objek (bukan merge per field) —
 * klien selalu mengirim keadaan lengkap dari form-nya, dan merge diam-diam
 * membuat field yang dikosongkan user tidak pernah hilang.
 */
export async function upsertMemory(ownerId: string, preferences: StyleMemory) {
	const [row] = await db
		.insert(userMemories)
		.values({ owner_id: ownerId, preferences })
		.onConflictDoUpdate({
			target: userMemories.owner_id,
			set: { preferences, updated_at: new Date() },
		})
		.returning()
	return row ?? null
}
