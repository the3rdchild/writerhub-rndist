import { eq } from 'drizzle-orm'
import db from '@/db'
import { analysisResult, grammarResult, poolRequest } from '@/db/schemas'

/**
 * Pembacaan baris job berdasarkan `job_id`. Dipakai bareng oleh PoolingService
 * (polling) dan route SSE (snapshot awal sebelum berlangganan pub/sub).
 */

export async function findPoolRequest(jobId: string) {
	const [row] = await db.select().from(poolRequest).where(eq(poolRequest.job_id, jobId)).limit(1)
	return row ?? null
}

export async function findGrammarResult(jobId: string) {
	const [row] = await db.select().from(grammarResult).where(eq(grammarResult.job_id, jobId)).limit(1)
	return row ?? null
}

export async function findAnalysisResult(jobId: string) {
	const [row] = await db.select().from(analysisResult).where(eq(analysisResult.job_id, jobId)).limit(1)
	return row ?? null
}
