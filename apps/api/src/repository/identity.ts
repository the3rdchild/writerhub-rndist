import { env } from '@/config/env'
import db from '@/db'
import { identity } from '@/db/schemas'
import type { IdentityOrigin } from '@/lib/create-app'
import { TtlCache } from '@/lib/ttl-cache'

/**
 * Id identitas per (origin, user). Tanpa cache ini, setiap permintaan yang
 * menyentuh data pengguna, termasuk GET, menjalankan upsert ke `identity`.
 * Pada uji beban 30 Sep tercatat ±257 ribu UPDATE untuk ±258 ribu permintaan.
 * Barisnya tidak pernah dihapus dan id-nya tidak pernah berganti, jadi aman
 * disimpan.
 */
const identities = new TtlCache<string>({ ttlMs: env.IDENTITY_CACHE_TTL_S * 1000, maxEntries: 50_000 })

export async function resolveIdentityId(userId: string, origin: IdentityOrigin): Promise<string> {
	return identities.getOrLoad(`${origin}:${userId}`, () => upsertIdentity(userId, origin))
}

async function upsertIdentity(userId: string, origin: IdentityOrigin): Promise<string> {
	const [row] = await db
		.insert(identity)
		.values({ user_id: userId, origin })
		.onConflictDoUpdate({
			target: [identity.user_id, identity.origin],
			set: { user_id: userId },
		})
		.returning({ id: identity.id })
	if (!row) throw new Error("Couldn't resolve the identity")
	return row.id
}
