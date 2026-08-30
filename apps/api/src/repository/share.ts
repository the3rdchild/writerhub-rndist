import db from '@/db'
import type { NewShare } from '@/db/schemas'
import { shares } from '@/db/schemas'

export async function insertShare(values: NewShare) {
	const [row] = await db.insert(shares).values(values).returning()
	return row ?? null
}
