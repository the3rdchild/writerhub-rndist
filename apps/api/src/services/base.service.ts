import type { ErrorResponse, SuccessResponse } from '@writer-hub/shared'
import type { Context } from 'hono'
import type { ContentfulStatusCode } from 'hono/utils/http-status'
import redis from '@/config/redis'
import db from '@/db'
import type { AppEnv } from '@/lib/create-app'
import { AppError } from '@/lib/error'
import LoggerClient from '@/lib/logger'
import { resolveIdentityId } from '@/repository/identity'

const log = LoggerClient.getInstance()
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export default abstract class BaseService {
	protected readonly db: typeof db
	protected readonly redis: typeof redis
	protected readonly context: Context<AppEnv>

	constructor(context: Context<AppEnv>) {
		this.db = db
		this.redis = redis
		this.context = context
	}

	protected success<T>({
		data,
		status = 200,
		message = 'sukses',
	}: {
		data?: T
		status?: ContentfulStatusCode
		message?: string
	}): Response {
		this.context.status(status)
		const response: SuccessResponse<T> = { message }
		if (data !== null && data !== undefined) response.data = data
		return this.context.json(response)
	}

	protected error({
		errors,
		status = 400,
		message = 'Bad Request',
	}: {
		errors: string[]
		status?: ContentfulStatusCode
		message?: string
	}): Response {
		this.context.status(status)
		const response: ErrorResponse = { message, errors }
		return this.context.json(response)
	}
	protected failFromError(error: unknown): Response {
		if (error instanceof AppError) {
			if (error.statusCode >= 500) this.logError(error.message, error.stack)
			return this.error({ errors: [error.message], status: error.statusCode })
		}

		// Galat tak terduga hanya masuk log. Pesannya sering membawa kueri SQL utuh
		// (drizzle menempelkannya ke Error.message), dan itu tidak boleh sampai ke
		// klien - sama seperti penanganan di app.onError.
		const message = error instanceof Error ? error.message : 'internal server error'
		this.logError(message, error instanceof Error ? error.stack : undefined)
		return this.error({ errors: ['internal server error'], status: 500, message: 'internal server error' })
	}

	/**
	 * Param path yang wajib berupa UUID. Tanpa pemeriksaan ini nilai sembarang
	 * diteruskan apa adanya ke Postgres dan balik sebagai 500 "invalid input
	 * syntax for type uuid", padahal yang salah adalah permintaannya.
	 */
	protected uuidParam(name: string, label: string): string {
		const value = this.context.req.param(name)
		if (!value) throw AppError.badRequest(`${label} tidak ada`)
		if (!UUID_PATTERN.test(value)) throw AppError.badRequest(`${label} bukan UUID yang sah`)
		return value
	}

	/** Sama seperti {@link uuidParam}, tapi untuk query string opsional. */
	protected optionalUuidQuery(name: string, label: string): string | undefined {
		const value = this.context.req.query(name)
		if (value === undefined || value === '') return undefined
		if (!UUID_PATTERN.test(value)) throw AppError.badRequest(`${label} bukan UUID yang sah`)
		return value
	}

	private logError(message: string, stack?: string): void {
		log.error(
			{ err: { message, stack }, method: this.context.req.method, path: this.context.req.path },
			message,
		)
	}
	protected async identityId(): Promise<string> {
		const userId = this.context.get('userId')
		const origin = this.context.get('identityOrigin')
		if (!userId || !origin) throw AppError.unauthorized('User tidak dikenal')
		return resolveIdentityId(userId, origin)
	}

	protected async cacheGet<T>(key: string): Promise<T | null> {
		try {
			const data = await this.redis.get(key)
			return data ? (JSON.parse(data) as T) : null
		} catch {
			return null
		}
	}

	protected async cacheSet(key: string, value: unknown, ttlSeconds?: number): Promise<void> {
		const serialized = JSON.stringify(value)
		if (ttlSeconds) await this.redis.setex(key, ttlSeconds, serialized)
		else await this.redis.set(key, serialized)
	}
}
