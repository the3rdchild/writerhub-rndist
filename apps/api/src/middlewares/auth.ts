import { createHmac, timingSafeEqual } from 'node:crypto'
import { createMiddleware } from 'hono/factory'
import { env, isLocalAuth } from '@/config/env'
import { verifyPpBearerToken } from '@/lib/pp-auth'

const PP_TIMESTAMP_SKEW_MS = 5 * 60 * 1000
const API_KEY = env.API_KEYS?.trim()

function fail(message: string, errors: string[], status: 400 | 401) {
	return Response.json({ success: false, message, errors }, { status })
}

function verifyPpApiKeySignature(signatureHex: string, timestamp: string): boolean {
	if (!env.PP_API_KEY) return false

	const ts = Number(timestamp)
	if (!Number.isFinite(ts)) return false
	if (Math.abs(Date.now() - ts) > PP_TIMESTAMP_SKEW_MS) return false

	const expectedHex = createHmac('sha256', env.PP_API_KEY).update(timestamp).digest('hex')
	if (signatureHex.length !== expectedHex.length) return false

	try {
		return timingSafeEqual(Buffer.from(signatureHex, 'hex'), Buffer.from(expectedHex, 'hex'))
	} catch {
		return false
	}
}

export const authMiddleware = createMiddleware(async (c, next) => {
	// Mode lokal: tidak ada kredensial yang dibagikan, jadi seluruh pemeriksaan
	// dilewati. Jalur produksi di bawahnya sengaja dibiarkan utuh - cukup ubah
	// AUTH_MODE untuk mengaktifkannya kembali.
	if (isLocalAuth) {
		// Fallback dev lokal: semua request dianggap milik satu user tetap supaya
		// `owner_id` dokumen selalu terisi tanpa kredensial apa pun.
		c.set('userId', 'local-dev')
		c.set('identityOrigin', 'ppe')
		await next()
		return
	}

	const client = c.req.header('x-client')
	const ppApiKey = c.req.header('x-pp-api-key')
	const ppTimestamp = c.req.header('x-pp-timestamp')
	const ranselAiApiKey = c.req.header('x-ransel-ai-api-key')
	const ranselUserId = c.req.header('x-ransel-user-id')?.trim()

	if (!client) {
		return fail('Authentication required', ["Missing x-client header. Please provide 'x-client' header"], 401)
	}

	if (client === 'pp-extended') {
		if (!ppApiKey) {
			return fail('Authentication required', ['Please provide your API key to continue.'], 401)
		}
		if (!ppTimestamp) {
			return fail('Authentication required', ['Missing x-pp-timestamp header.'], 401)
		}
		if (!verifyPpApiKeySignature(ppApiKey.toLowerCase(), ppTimestamp)) {
			return fail(
				'Authentication failed',
				['The API key you provided is invalid or expired. Please double-check your credentials and try again.'],
				401,
			)
		}

		const authHeader = c.req.header('authorization') ?? ''
		await verifyPpBearerToken(authHeader)
		const ppUserId = c.req.header('x-pp-user-id')?.trim()
		if (ppUserId) {
			c.set('userId', ppUserId)
			c.set('identityOrigin', 'ppe')
		}
		if (authHeader.startsWith('Bearer ')) c.set('bearerToken', authHeader.slice(7).trim())
	} else if (client === 'ransel-ai') {
		if (!ranselAiApiKey) {
			return fail('Authentication required', ['Please provide your API key to continue.'], 401)
		}
		if (ranselAiApiKey !== env.RANSEL_AI_API_KEY) {
			return fail(
				'Authentication failed',
				['The API key you provided is invalid. Please double-check your credentials and try again.'],
				401,
			)
		}
		if (ranselUserId) {
			c.set('userId', ranselUserId)
			c.set('identityOrigin', 'ransel')
		}
	} else if (client === 'another-client') {
		const apiKey = c.req.header('x-api-key')
		if (!apiKey) {
			return fail('Authentication required', ['x-api-key header is required'], 401)
		}
		if (apiKey !== API_KEY) {
			return fail('Authentication failed', ['invalid api key'], 401)
		}
	} else {
		return fail('Unrecognized client', [`The client '${client}' is not recognized.`], 401)
	}

	await next()
})
