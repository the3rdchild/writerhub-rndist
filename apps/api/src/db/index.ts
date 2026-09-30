import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { env } from '@/config/env'
import * as schema from './schemas'

// `max` ditulis eksplisit: bawaan postgres-js (10) sudah penuh pada uji beban
// 1.200 penulis, dan jumlah totalnya harus muat di `max_connections` Postgres
// (lihat DB_POOL_MAX di config/env.ts).
const queryClient = postgres(env.DATABASE_URL, { max: env.DB_POOL_MAX })

const db = drizzle({ client: queryClient, schema })

export async function checkDatabaseConnection(): Promise<boolean> {
	try {
		await queryClient`SELECT 1`
		return true
	} catch (error) {
		console.error('Failed to check database connection', error)
		return false
	}
}

export async function disconnectDatabase(): Promise<void> {
	await queryClient.end()
}

export default db
