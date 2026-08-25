import { Hono } from 'hono'

/** Origin client yang mengisi `userId` - dipakai untuk resolve `identity.id`. */
export type IdentityOrigin = 'ransel' | 'ppe'

/**
 * Variabel context yang diisi `authMiddleware` dan dibaca service.
 * `bearerToken` dipakai untuk resolve provider LLM per user di admin-ppe.
 * `identityOrigin` menyertai `userId` supaya id eksternal yang sama dari
 * client berbeda tidak pernah tertukar saat di-resolve ke `identity.id`.
 */
export type AppEnv = {
	Variables: {
		userId?: string
		bearerToken?: string
		identityOrigin?: IdentityOrigin
	}
}

export function createRouter() {
	return new Hono<AppEnv>({ strict: false })
}

export default function createApp() {
	return createRouter()
}
