import type { Context, Next } from 'hono'
import LoggerClient from '@/utils/logger'

export async function httpLogger(c: Context, next: Next) {
	const start = Date.now()
	const { method } = c.req
	const url = new URL(c.req.url)

	await next()

	const duration = Date.now() - start
	const status = c.res.status

	const logger = LoggerClient.getInstance()
	const logData = {
		method,
		path: url.pathname,
		status,
		duration_ms: duration,
	}

	if (status >= 500) {
		logger.error(logData)
	} else if (status >= 400) {
		logger.warn(logData)
	} else {
		logger.info(logData)
	}
}
