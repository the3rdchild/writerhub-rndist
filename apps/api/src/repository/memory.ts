import type { StyleMemory } from '@writer-hub/shared'
import { eq } from 'drizzle-orm'
import db from '@/db'
import { userMemories } from '@/db/schemas'

export async function findMemoryByOwner(ownerId: string) {
	const [row] = await db.select().from(userMemories).where(eq(userMemories.owner_id, ownerId)).limit(1)
	return row ?? null
}

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
