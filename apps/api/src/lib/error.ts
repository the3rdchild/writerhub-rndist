import { HTTPException } from 'hono/http-exception'
import type { ContentfulStatusCode } from 'hono/utils/http-status'

/**
 * Error HTTP dengan status eksplisit. Ditangkap `BaseService.failFromError`
 * dan `app.onError`, lalu diubah jadi envelope error yang seragam.
 */
export class AppError extends HTTPException {
	constructor(
		public readonly statusCode: ContentfulStatusCode,
		public override readonly message: string,
		public readonly errorCode?: string,
	) {
		super(statusCode, { message })
	}

	static badRequest(message: string, errorCode?: string) {
		return new AppError(400, message, errorCode)
	}

	static unauthorized(message: string, errorCode?: string) {
		return new AppError(401, message, errorCode)
	}

	static forbidden(message: string, errorCode?: string) {
		return new AppError(403, message, errorCode)
	}

	static notFound(message: string, errorCode?: string) {
		return new AppError(404, message, errorCode)
	}

	static conflict(message: string, errorCode?: string) {
		return new AppError(409, message, errorCode)
	}

	static cantProcess(message: string, errorCode?: string) {
		return new AppError(422, message, errorCode)
	}

	static tooManyRequests(message: string, errorCode?: string) {
		return new AppError(429, message, errorCode)
	}

	static internalServerError(message: string, errorCode?: string) {
		return new AppError(500, message, errorCode)
	}
}
