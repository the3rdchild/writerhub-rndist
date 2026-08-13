import type { Redis } from 'ioredis'
import { createRouter } from '@/lib/create-app'
import { env } from '@/config/env'
import { RedisClient } from '@/config/redis'
import { jobChannel } from '@/lib/job-events'
import { markPoolRequestCancelled } from '@/repository/job-result'
import { authMiddleware } from '@/middlewares/auth'

/**
 * Pembatalan job dari sisi server (§P7 lapis B).
 *
 * UI sudah bebas seketika lewat lapis A (AbortController di sisi klien); rute ini
 * berusaha membebaskan worker pula - tapi best effort, karena worker mungkin
 * sedang menunggu jawaban LLM. Bendera Redis `job:{id}:cancel` dibaca titik
 * periksa kooperatif worker (lapis C, B-9).
 *
 * Job yang dibatalkan TETAP menagih kuota (§2.8): token sudah terpakai di sisi
 * penyedia, jadi 'cancelled' dicatat sebagai pemakaian.
 */
const jobs = createRouter().basePath('/jobs')

jobs.use('*', authMiddleware)

const CANCEL_FLAG_TTL_SECONDS = 3600

/** Coba buang job yang belum jalan dari antrean BullMQ (BRPOP worker memakai
 *  daftar tunggu `bull:{queue}:wait`). Mengembalikan true kalau berhasil dicabut. */
async function removeFromQueue(redis: Redis, jobId: string): Promise<boolean> {
	for (const queueName of [env.GRAMMAR_QUEUE_NAME || 'GRAMMAR_QUEUE', env.ANALYSIS_QUEUE_NAME || 'ANALYSIS_QUEUE']) {
		const waitKey = `bull:${queueName}:wait`
		const removed = await redis.lrem(waitKey, 0, jobId)
		if (removed > 0) {
			// Hash job ikut dibersihkan - worker kita konsumsi pakai BRPOP dan
			// membersihkannya sendiri, jadi yang tertinggal di antrean harus dibuang
			// manual saat dibatalkan sebelum diambil.
			await redis.del(`bull:${queueName}:${jobId}`)
			return true
		}
	}
	return false
}

jobs.post('/:jobId/cancel', async (c) => {
	const jobId = c.req.param('jobId')
	const redis = RedisClient.getInstance()

	const previous = await markPoolRequestCancelled(jobId)

	// Bendera cancel dibangun APA PUN hasilnya: kalau job sudah terminal, tidak
	// ada salahnya; kalau sedang diproses, inilah yang dibaca titik periksa worker.
	await redis.set(`job:${jobId}:cancel`, '1', 'EX', CANCEL_FLAG_TTL_SECONDS)

	if (previous === 'pending') {
		// Masih di antrean - bisa dibatalkan sungguhan sebelum pernah dikerjakan.
		await removeFromQueue(redis, jobId)
	}

	// Kabari SSE yang masih tersambung supaya ditutup rapi (isTerminalEvent
	// mengenali 'cancelled').
	await redis.publish(jobChannel(jobId), JSON.stringify({ type: 'cancelled' }))

	// Idempoten: kalau job tidak ada / sudah terminal, tetap 200 - klien tidak
	// peduli, UI-nya sudah bebas.
	return c.json({ jobId, status: 'cancelled' }, 200)
})

export default jobs
