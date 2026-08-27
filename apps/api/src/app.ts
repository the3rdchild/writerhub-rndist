import { cors } from 'hono/cors'
import { poweredBy } from 'hono/powered-by'
import { AUTH_HEADERS } from '@writer-hub/shared'
import { env, isProduction, validateEnv } from '@/config/env'
import createApp from '@/lib/create-app'
import { AppError } from '@/lib/error'
import { v1Routes } from '@/routes/v1'
import { httpLogger } from '@/lib/http-logger'
import LoggerClient from '@/lib/logger'

validateEnv()

const app = createApp()

app.onError((err, c) => {
	const status = err instanceof AppError ? err.statusCode : 500
	const message = err instanceof AppError ? err.message : 'internal server error'

	const logger = LoggerClient.getInstance()
	const log = status >= 500 ? logger.error.bind(logger) : logger.warn.bind(logger)
	log(
		{ err: { message: err.message, stack: err.stack }, method: c.req.method, path: c.req.path, status },
		err.message,
	)

	return c.json({ message, errors: [err.message] }, status)
})

app.use(httpLogger)
app.use(poweredBy({ serverName: 'writer-hub API' }))

app.use(
	'*',
	cors({
		origin: env.ORIGIN,
		credentials: true,
		allowHeaders: ['Content-Type', 'Authorization', 'Cookie', ...Object.values(AUTH_HEADERS)],
		...(isProduction && {
			allowMethods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
			exposeHeaders: ['Content-Length', 'Set-Cookie'],
			maxAge: 600,
		}),
	}),
)

for (const route of v1Routes) {
	app.basePath('/api').route('/v1', route)
}

export default app
