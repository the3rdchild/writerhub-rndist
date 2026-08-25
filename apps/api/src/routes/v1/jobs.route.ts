import type { Redis } from 'ioredis'
import { createRouter } from '@/lib/create-app'
import { env } from '@/config/env'
import { RedisClient } from '@/config/redis'
import { jobChannel } from '@/lib/job-events'
import { markPoolRequestCancelled } from '@/repository/job-result'
import { authMiddleware } from '@/middlewares/auth'
const jobs = createRouter().basePath('/jobs')

jobs.use('*', authMiddleware)

const CANCEL_FLAG_TTL_SECONDS = 3600
async function removeFromQueue(redis: Redis, jobId: string): Promise<boolean> {
	for (const queueName of [env.GRAMMAR_QUEUE_NAME || 'GRAMMAR_QUEUE', env.ANALYSIS_QUEUE_NAME || 'ANALYSIS_QUEUE']) {
		const waitKey = `bull:${queueName}:wait`
		const removed = await redis.lrem(waitKey, 0, jobId)
		if (removed > 0) {
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
	await redis.set(`job:${jobId}:cancel`, '1', 'EX', CANCEL_FLAG_TTL_SECONDS)

	if (previous === 'pending') {
		await removeFromQueue(redis, jobId)
	}
	await redis.publish(jobChannel(jobId), JSON.stringify({ type: 'cancelled' }))
	return c.json({ jobId, status: 'cancelled' }, 200)
})

export default jobs
