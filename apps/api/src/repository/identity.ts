import db from '@/db'
import { identity } from '@/db/schemas'
import type { IdentityOrigin } from '@/lib/create-app'

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
