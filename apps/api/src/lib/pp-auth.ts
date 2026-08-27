import { env } from '@/config/env'
import { AppError } from '@/lib/error'
import LoggerClient from '@/lib/logger'

interface AuthCheckResponse {
	data: {
		authenticated: boolean
		msg: string
	}
	message: string
}

export async function verifyPpBearerToken(authHeader: string): Promise<void> {
	if (!authHeader.startsWith('Bearer ')) {
		throw AppError.unauthorized('Missing or invalid Authorization header.')
	}

	const token = authHeader.slice(7).trim()
	if (!token) {
		throw AppError.unauthorized('Bearer token is empty.')
	}

	if (!env.PP_BACKEND_URL || !env.PP_AUTH_CHECK_URL) {
		throw AppError.internalServerError('PP_BACKEND_URL or PP_AUTH_CHECK_URL  is not configured.')
	}

	let checkRes: Response
	try {
		checkRes = await fetch(`${env.PP_BACKEND_URL}/auth/check`, {
			headers: { authorization: `Bearer ${token}` },
		})
	} catch (error) {
		LoggerClient.getInstance().error(
			{
				err: error instanceof Error ? { message: error.message, stack: error.stack } : error,
				auth_service_url: `${env.PP_BACKEND_URL}/auth/check`,
			},
			'Could not reach authentication service.',
		)

		throw new AppError(503, 'Could not reach authentication service. Please try again later.')
	}

	if (!checkRes.ok) {
		LoggerClient.getInstance().warn(
			{
				auth_service_status: checkRes.status,
				auth_service_status_text: checkRes.statusText,
				auth_service_path: '/auth/check',
			},
			'Authentication service rejected bearer token check.',
		)

		throw AppError.unauthorized('Auth service returned an error. Please try again.')
	}

	let body: AuthCheckResponse
	try {
		body = (await checkRes.json()) as AuthCheckResponse
	} catch {
		throw new AppError(502, 'Invalid response from authentication service.')
	}

	if (!body.data?.authenticated) {
		throw AppError.unauthorized('Session expired or invalid. Please log in again.')
	}
}
