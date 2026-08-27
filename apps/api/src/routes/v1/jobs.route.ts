import type { Redis } from 'ioredis'
import { createRouter } from '@/lib/create-app'
import { env } from '@/config/env'
import { RedisClient } from '@/config/redis'
import { cancelFlagKey, jobChannel } from '@/lib/job-events'
import QueueClient from '@/lib/queue'
import { markPoolRequestCancelled } from '@/repository/job-result'
import { authMiddleware } from '@/middlewares/auth'
const jobs = createRouter().basePath('/jobs')

jobs.use('*', authMiddleware)

const CANCEL_FLAG_TTL_SECONDS = 3600

async function removeFromQueue(redis: Redis, jobId: string): Promise<boolean> {
	for (const queueName of [
		env.GRAMMAR_QUEUE_NAME || 'GRAMMAR_QUEUE',
		env.ANALYSIS_QUEUE_NAME || 'ANALYSIS_QUEUE',
	]) {
		const removed = await redis.lrem(QueueClient.waitKey(queueName), 0, jobId)
		if (removed > 0) {
			await redis.del(QueueClient.jobHashKey(queueName, jobId))
			return true
		}
	}
	return false
}

jobs.post('/:jobId/cancel', async (c) => {
	const jobId = c.req.param('jobId')
	const redis = RedisClient.getInstance()

	const previous = await markPoolRequestCancelled(jobId)
	await redis.set(cancelFlagKey(jobId), '1', 'EX', CANCEL_FLAG_TTL_SECONDS)

	if (previous === 'pending') {
		await removeFromQueue(redis, jobId)
	}
	await redis.publish(jobChannel(jobId), JSON.stringify({ type: 'cancelled' }))
	return c.json({ jobId, status: 'cancelled' }, 200)
})

export default jobs
