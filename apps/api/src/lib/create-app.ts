import { Hono } from 'hono'
export type IdentityOrigin = 'ransel' | 'ppe'

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
