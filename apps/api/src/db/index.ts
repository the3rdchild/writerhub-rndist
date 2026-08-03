import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { env } from '@/config/env'
import * as schema from './schemas'

const queryClient = postgres(env.DATABASE_URL)

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
