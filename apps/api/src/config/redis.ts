import { Redis } from 'ioredis'
import { env } from '@/config/env'

class RedisClient {
	private static instance: Redis | null = null

	static getInstance(): Redis {
		if (!RedisClient.instance) {
			RedisClient.instance = new Redis({
				host: env.REDIS_HOST,
				port: Number(env.REDIS_PORT),
				password: env.REDIS_PASSWORD || undefined,
				maxRetriesPerRequest: null,
			})

			RedisClient.instance.on('error', (err) => {
				console.error('Redis error:', err)
			})
		}
		return RedisClient.instance
	}

	static async checkConnection(): Promise<boolean> {
		try {
			await RedisClient.getInstance().ping()
			return true
		} catch {
			return false
		}
	}

	static async disconnect(): Promise<void> {
		if (RedisClient.instance) {
			await RedisClient.instance.quit()
			RedisClient.instance = null
		}
	}
}

export { RedisClient }

// Shared ioredis instance used by BaseService cache helpers.
const redis = RedisClient.getInstance()
export default redis
