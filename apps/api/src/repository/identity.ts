import db from '@/db'
import { identity } from '@/db/schemas'
import type { IdentityOrigin } from '@/lib/create-app'

/**
 * Resolve id eksternal (mis. `x-pp-user-id`) + origin client jadi satu
 * `identity.id` (uuid) - dibuat kalau belum ada, dipakai ulang kalau sudah.
 * Ini satu-satunya cara identity.id boleh didapat; jangan query tabel
 * `identity` langsung dari service lain.
 */
export async function resolveIdentityId(userId: string, origin: IdentityOrigin): Promise<string> {
	const [row] = await db
		.insert(identity)
		.values({ user_id: userId, origin })
		.onConflictDoUpdate({
			target: [identity.user_id, identity.origin],
			set: { user_id: userId },
		})
		.returning({ id: identity.id })
	if (!row) throw new Error('Gagal resolve identity')
	return row.id
}
