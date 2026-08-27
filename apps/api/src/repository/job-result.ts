import { eq } from 'drizzle-orm'
import db from '@/db'
import { metadataVersion, poolRequest } from '@/db/schemas'
const TERMINAL_STATUSES = ['completed', 'failed', 'cancelled'] as const

export async function findPoolRequest(jobId: string) {
	const [row] = await db.select().from(poolRequest).where(eq(poolRequest.job_id, jobId)).limit(1)
	return row ?? null
}

export async function markPoolRequestCancelled(jobId: string): Promise<'pending' | 'processing' | null> {
	const current = await findPoolRequest(jobId)
	if (!current || (TERMINAL_STATUSES as readonly string[]).includes(current.status)) return null

	const previous = current.status as 'pending' | 'processing'
	await db
		.update(poolRequest)
		.set({ status: 'cancelled', updated_at: new Date() })
		.where(eq(poolRequest.job_id, jobId))

	return previous
}

export async function findMetadataVersion(jobId: string) {
	const [row] = await db.select().from(metadataVersion).where(eq(metadataVersion.job_id, jobId)).limit(1)
	return row ?? null
}
