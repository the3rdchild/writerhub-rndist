import type { ErrorResponse, SuccessResponse } from '@writer-hub/shared'
import type { Context } from 'hono'
import type { ContentfulStatusCode } from 'hono/utils/http-status'
import redis from '@/config/redis'
import db from '@/db'
import type { AppEnv } from '@/lib/create-app'
import { AppError } from '@/lib/error'
import { resolveIdentityId } from '@/repository/identity'
import LoggerClient from '@/utils/logger'

const log = LoggerClient.getInstance()
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

		const message = error instanceof Error ? error.message : 'internal server error'
		this.logError(message, error instanceof Error ? error.stack : undefined)
		return this.error({ errors: [message], status: 500, message: 'internal server error' })
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
