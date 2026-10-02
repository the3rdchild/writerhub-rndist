import app from '@/app'
import { closeCollabBus } from '@/collab/bus'
import { type CollabSocketData, collabWebSocketHandler, shutdownCollab } from '@/collab/server'
import { env } from '@/config/env'
import { isPrimaryApiProcess } from '@/config/processes'
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

	if (isPrimaryApiProcess()) await seedBuiltinTemplatesSafely()

	const server = Bun.serve<CollabSocketData>({
		hostname: '0.0.0.0',
		port: env.PORT,
		idleTimeout: 0, // SSE stream bisa berjalan lama (mode advanced ~60s)
		// Beberapa proses berbagi port ini bila API_PROCESSES > 1 (config/processes.ts).
		reusePort: env.API_PROCESSES > 1,
		// `server` diteruskan sebagai env Hono: rute websocket kolaborasi butuh `server.upgrade`.
		fetch: (request, server) => app.fetch(request, server),
		websocket: collabWebSocketHandler,
	})

	console.log('✅ Service status:')
	console.log(`- API: running on http://localhost:${env.PORT}`)
	console.log('- PostgreSQL: connected')
	console.log('- Redis: connected')

	registerShutdownHandlers(async () => {
		// Berhenti menerima sambungan baru DULU (tanpa ditunggu: janjinya baru
		// selesai saat semua sambungan habis). Klien kolaborasi yang diputus 1012
		// langsung menyambung ulang; kalau port masih mendengar, sambungan baru
		// itu membuat `stop(true)` di bawah menggantung sampai proses dibunuh.
		void server.stop(false)
		// Lalu room kolaborasi: antrean tulisnya harus sampai ke Postgres dan
		// kliennya menerima 1012 (pindah replika) sebelum soketnya diputus paksa.
		await shutdownCollab()
		await closeCollabBus()
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
