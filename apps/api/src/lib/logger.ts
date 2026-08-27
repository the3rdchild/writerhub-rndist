import pino from 'pino'
import { env } from '@/config/env'

class LoggerClient {
	private static instance: pino.Logger | null = null

	static getInstance(): pino.Logger {
		if (!LoggerClient.instance) {
			const isDev = env.NODE_ENV !== 'production'

			LoggerClient.instance = pino({
				level: isDev ? 'debug' : 'info',
				...(isDev && {
					transport: {
						target: 'pino-pretty',
						options: {
							colorize: true,
							translateTime: 'SYS:HH:MM:ss',
							ignore: 'pid,hostname',
						},
					},
				}),
			})
		}
		return LoggerClient.instance
	}
}

export default LoggerClient
