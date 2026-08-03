import { Hono } from 'hono'

/**
 * Variabel context yang diisi `authMiddleware` dan dibaca service.
 * `bearerToken` dipakai untuk resolve provider LLM per user di admin-ppe.
 */
export type AppEnv = {
	Variables: {
		userId?: string
		bearerToken?: string
	}
}

export function createRouter() {
	return new Hono<AppEnv>({ strict: false })
}

export default function createApp() {
	return createRouter()
}
