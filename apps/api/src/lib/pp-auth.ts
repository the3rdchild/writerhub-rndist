import { createHash } from 'node:crypto'
import { env } from '@/config/env'
import { AppError } from '@/lib/error'
import LoggerClient from '@/lib/logger'
import { isPpBackendAvailable, recordPpBackendResult } from '@/lib/pp-backend-breaker'
import { TtlCache } from '@/lib/ttl-cache'

interface AuthCheckResponse {
	data: {
		authenticated: boolean
		msg: string
	}
	message: string
}

/**
 * Token yang sudah lolos `/auth/check`, dikunci dengan hash-nya supaya token
 * mentah tidak tinggal di memori lebih lama dari permintaannya. Yang disimpan
 * hanya hasil lolos. Penolakan selalu ditanyakan ulang, jadi pengguna yang
 * baru login tidak tertahan oleh jawaban lama.
 *
 * Saat pemeriksaan ulang di latar gagal, token yang ditolak (401) langsung
 * dibuang. Galat karena pp-backend tidak terjangkau (5xx) membiarkan hasil
 * lamanya berlaku sampai jendela basinya habis.
 */
const verified = new TtlCache<true>({
	ttlMs: env.PP_AUTH_CACHE_TTL_S * 1000,
	staleMs: env.PP_AUTH_STALE_S * 1000,
	maxEntries: 20_000,
	evictOnError: (error) => !(error instanceof AppError && error.statusCode >= 500),
})

export function tokenCacheKey(token: string): string {
	return createHash('sha256').update(token).digest('hex')
}

/**
 * Memastikan bearer token pengguna sah menurut pp-backend, lalu
 * mengembalikan token mentahnya.
 *
 * Hasil lolos disimpan selama `PP_AUTH_CACHE_TTL_S`. Tanpa cache, setiap
 * permintaan WritingHub menjadi satu permintaan ke pp-backend, dan pp-backend
 * yang lambat melipatgandakan latensi WritingHub (uji beban 30 Sep: jeda 3 dtk
 * di sana menjadi p95 12 dtk di sini).
 */
export async function verifyPpBearerToken(authHeader: string): Promise<string> {
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

	await verified.getOrLoad(tokenCacheKey(token), () => checkWithPpBackend(token))
	return token
}

async function checkWithPpBackend(token: string): Promise<true> {
	if (!isPpBackendAvailable()) {
		throw new AppError(503, 'Authentication service is unavailable. Please try again shortly.')
	}

	let checkRes: Response
	try {
		checkRes = await fetch(`${env.PP_BACKEND_URL}/auth/check`, {
			headers: { authorization: `Bearer ${token}` },
			signal: AbortSignal.timeout(env.PP_AUTH_TIMEOUT_MS),
		})
	} catch (error) {
		LoggerClient.getInstance().error(
			{
				err: error instanceof Error ? { message: error.message, stack: error.stack } : error,
				auth_service_url: `${env.PP_BACKEND_URL}/auth/check`,
				timeout_ms: env.PP_AUTH_TIMEOUT_MS,
			},
			'Could not reach authentication service.',
		)

		recordPpBackendResult(false)
		throw new AppError(503, 'Could not reach authentication service. Please try again later.')
	}

	// 5xx berarti pp-backend yang bermasalah, bukan tokennya. Menjawabnya 401
	// akan menyuruh pengguna login ulang, dan membuang token sah dari cache.
	if (checkRes.status >= 500) {
		LoggerClient.getInstance().error(
			{ auth_service_status: checkRes.status, auth_service_path: '/auth/check' },
			'Authentication service failed.',
		)
		recordPpBackendResult(false)
		throw new AppError(503, 'Authentication service is unavailable. Please try again later.')
	}
	recordPpBackendResult(true)

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

	return true
}

/** Untuk uji: melupakan semua token yang sudah diverifikasi. */
export function clearPpAuthCache(): void {
	verified.clear()
}
