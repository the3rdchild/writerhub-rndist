import { createHmac } from 'node:crypto'
import { env } from '@/config/env'
import { AppError } from '@/lib/error'

export function signPpApiKey(): { signature: string; timestamp: string } {
	if (!env.PP_API_KEY) {
		throw AppError.internalServerError('PP_API_KEY is not configured.')
	}

	const timestamp = Date.now().toString()
	const signature = createHmac('sha256', env.PP_API_KEY).update(timestamp).digest('hex')
	return { signature, timestamp }
}

export function signPpHmacRequest(
	method: string,
	path: string,
	body: string,
): { signature: string; timestamp: string } {
	if (!env.PP_EXTENDED_ADMIN_HMAC_SECRET) {
		throw AppError.internalServerError('PP_EXTENDED_ADMIN_HMAC_SECRET is not configured.')
	}

	const timestamp = Date.now().toString()
	const stringToSign = `${method}\n${path}\n${body}\n${timestamp}`
	const signature = createHmac('sha256', env.PP_EXTENDED_ADMIN_HMAC_SECRET).update(stringToSign).digest('hex')
	return { signature, timestamp }
}
