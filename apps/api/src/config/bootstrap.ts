import app from '@/app'
import { env } from '@/config/env'
import { RedisClient } from '@/config/redis'
import { checkDatabaseConnection, disconnectDatabase } from '@/db'
import QueueClient from '@/lib/queue'
import { seedBuiltinTemplatesSafely } from '@/services/templates/seed'

const globalRuntime = globalThis as typeof globalThis & {
	__signalHandlers?: { sigint: () => void; sigterm: () => void }
}

export async function bootstrap(): Promise<void> {
	console.log('⚡ Checking service dependencies...')

	if (!(await checkDatabaseConnection())) throw new Error('PostgreSQL connection failed')
	if (!(await RedisClient.checkConnection())) throw new Error('Redis connection failed')

	await seedBuiltinTemplatesSafely()

	const server = Bun.serve({
		hostname: '0.0.0.0',
		port: env.PORT,
		idleTimeout: 0, // SSE stream bisa berjalan lama (mode advanced ~60s)
		fetch: (request) => app.fetch(request),
	})

	console.log('✅ Service status:')
	console.log(`- API: running on http://localhost:${env.PORT}`)
	console.log('- PostgreSQL: connected')
	console.log('- Redis: connected')

	registerShutdownHandlers(async () => {
		await server.stop(true)
		await QueueClient.close()
		await RedisClient.disconnect()
		await disconnectDatabase()
	})
}

function registerShutdownHandlers(cleanup: () => Promise<void>): void {
	let isShuttingDown = false

	const shutdown = async (signal: string) => {
		if (isShuttingDown) return
		isShuttingDown = true

		console.log(`🛑 Received ${signal}, shutting down...`)
		try {
			await cleanup()
		} catch (error) {
			console.warn('⚠️ Graceful shutdown cleanup warning', error)
		} finally {
			process.exit(0)
		}
	}

	if (globalRuntime.__signalHandlers) {
		process.removeListener('SIGINT', globalRuntime.__signalHandlers.sigint)
		process.removeListener('SIGTERM', globalRuntime.__signalHandlers.sigterm)
	}

	const sigint = () => void shutdown('SIGINT')
	const sigterm = () => void shutdown('SIGTERM')

	process.on('SIGINT', sigint)
	process.on('SIGTERM', sigterm)
	globalRuntime.__signalHandlers = { sigint, sigterm }
}
