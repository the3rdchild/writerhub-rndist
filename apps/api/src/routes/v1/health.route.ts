import { RedisClient } from '@/config/redis'
import { checkDatabaseConnection } from '@/db'
import { createRouter } from '@/lib/create-app'

const health = createRouter().basePath('/health')
const HEALTH_CACHE_TTL_MS = 2000

type HealthResponse = {
	status: 'healthy' | 'unhealthy'
	services: {
		postgres: 'connected' | 'disconnected'
		redis: 'connected' | 'disconnected'
	}
	endpoints: {
		http: '/api/v1'
		health: '/api/v1/health'
	}
	serverTime: string
}

let cachedHealthResponse: HealthResponse | null = null
let cachedStatusCode: 200 | 503 = 503
let cachedAtMs = 0

health.get('/', async (c) => {
	const nowMs = Date.now()
	if (cachedHealthResponse && nowMs - cachedAtMs < HEALTH_CACHE_TTL_MS) {
		return c.json(cachedHealthResponse, cachedStatusCode)
	}

	const [isDatabaseConnected, isRedisConnected] = await Promise.all([
		checkDatabaseConnection(),
		RedisClient.checkConnection(),
	])

	const isHealthy = isDatabaseConnected && isRedisConnected
	const response: HealthResponse = {
		status: isHealthy ? 'healthy' : 'unhealthy',
		services: {
			postgres: isDatabaseConnected ? 'connected' : 'disconnected',
			redis: isRedisConnected ? 'connected' : 'disconnected',
		},
		endpoints: {
			http: '/api/v1',
			health: '/api/v1/health',
		},
		serverTime: new Date().toISOString(),
	}
	const statusCode: 200 | 503 = isHealthy ? 200 : 503

	cachedHealthResponse = response
	cachedStatusCode = statusCode
	cachedAtMs = nowMs

	return c.json(response, statusCode)
})

export default health
