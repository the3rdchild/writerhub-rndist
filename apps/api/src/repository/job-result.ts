import { eq } from 'drizzle-orm'
import db from '@/db'
import { analysisResult, grammarResult, poolRequest } from '@/db/schemas'

/**
 * Pembacaan baris job berdasarkan `job_id`. Dipakai bareng oleh PoolingService
 * (polling) dan route SSE (snapshot awal sebelum berlangganan pub/sub).
 */

/** Status yang tak bisa diubah lagi - sekau pembatalan ganda (§P7 lapis B). */
const TERMINAL_STATUSES = ['completed', 'failed', 'cancelled'] as const

export async function findPoolRequest(jobId: string) {
	const [row] = await db.select().from(poolRequest).where(eq(poolRequest.job_id, jobId)).limit(1)
	return row ?? null
}

/**
 * Tandai job batal kalau belum terminal. Mengembalikan keadaan SEBELUM pembaruan
 * supaya pemanggil tahu apakah job itu masih di antrean (pending) atau sedang
 * dikerjakan (processing) - keduanya butuh penanganan berbeda saat batal.
 *
 * Mengembalikan null kalau job tidak ada atau sudah terminal.
 */
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

export async function findGrammarResult(jobId: string) {
	const [row] = await db.select().from(grammarResult).where(eq(grammarResult.job_id, jobId)).limit(1)
	return row ?? null
}

export async function findAnalysisResult(jobId: string) {
	const [row] = await db.select().from(analysisResult).where(eq(analysisResult.job_id, jobId)).limit(1)
	return row ?? null
}
