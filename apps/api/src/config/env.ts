import 'dotenv/config'

const str = (key: string, fallback = ''): string => process.env[key] ?? fallback
const num = (key: string, fallback: number): number => Number(process.env[key]) || fallback
export type AuthMode = 'pp' | 'none'
export type StorageDriver = 's3' | 'local'
export const env = {
	NODE_ENV: str('NODE_ENV', 'development'),
	PORT: num('PORT', 8080),
	ORIGIN: str('ORIGIN', '*'),
	SERVICE_URL: str('SERVICE_URL', 'http://localhost:8080'),

	AUTH_MODE: (str('AUTH_MODE', 'pp') === 'none' ? 'none' : 'pp') as AuthMode,

	DATABASE_URL: str('DATABASE_URL'),

	REDIS_HOST: str('REDIS_HOST', 'localhost'),
	REDIS_PORT: num('REDIS_PORT', 6379),
	REDIS_PASSWORD: str('REDIS_PASSWORD'),
	STORAGE_DRIVER: (str('STORAGE_DRIVER', 's3') === 'local' ? 'local' : 's3') as StorageDriver,
	STORAGE_DIR: str('STORAGE_DIR', './storage'),

	CDN_BUCKET_NAME: str('CDN_BUCKET_NAME'),
	CDN_ENDPOINT: str('CDN_ENDPOINT'),
	CDN_PUBLIC_URL: str('CDN_PUBLIC_URL'),
	CDN_ACCESS_KEY_ID: str('CDN_ACCESS_KEY_ID'),
	CDN_SECRET_ACCESS_KEY: str('CDN_SECRET_ACCESS_KEY'),
	CDN_REGION: str('CDN_REGION', 'us-east-1'),
	S3_USE_OBJECT_ACL: str('S3_USE_OBJECT_ACL') === 'true',

	GRAMMAR_QUEUE_NAME: str('GRAMMAR_QUEUE_NAME', 'GRAMMAR_QUEUE'),
	GRAMMAR_JOB_NAME: str('GRAMMAR_JOB_NAME', 'PROCESS_GRAMMAR'),
	ANALYSIS_QUEUE_NAME: str('ANALYSIS_QUEUE_NAME', 'ANALYSIS_QUEUE'),
	ANALYSIS_JOB_NAME: str('ANALYSIS_JOB_NAME', 'PROCESS_ANALYSIS'),
	GRAMMAR_FORCE_MODEL: str('GRAMMAR_FORCE_MODEL', 'ai'),
	PP_API_KEY: str('PP_API_KEY'),
	PP_BACKEND_URL: str('PP_BACKEND_URL'),
	PP_AUTH_CHECK_URL: str('PP_AUTH_CHECK_URL'),
	API_KEYS: str('API_KEYS'),
	RANSEL_AI_API_KEY: str('RANSEL_AI_API_KEY'),
	AI_BASE_URL: str('AI_BASE_URL', 'https://openrouter.ai/api/v1'),
	AI_API_KEY: str('AI_API_KEY'),
	AI_MODEL: str('AI_MODEL', 'openai/gpt-4o-mini'),
	TAVILY_API_KEY: str('TAVILY_API_KEY'),
	RESEARCH_ENABLED: str('RESEARCH_ENABLED', 'true') !== 'false',
	RESEARCH_MAX_SEARCHES: num('RESEARCH_MAX_SEARCHES', 5),
	RESEARCH_MAX_EXTRACTS: num('RESEARCH_MAX_EXTRACTS', 8),
	RESEARCH_MAX_RESULTS: num('RESEARCH_MAX_RESULTS', 8),
	RESEARCH_MAX_ROUNDS: num('RESEARCH_MAX_ROUNDS', 20),
	RESEARCH_RESULT_CHARS: num('RESEARCH_RESULT_CHARS', 50_000),
	RESEARCH_CACHE_TTL_NEWS: num('RESEARCH_CACHE_TTL_NEWS', 10_800),
	RESEARCH_CACHE_TTL_GENERAL: num('RESEARCH_CACHE_TTL_GENERAL', 86_400),
	RESEARCH_DENY_DOMAINS: str('RESEARCH_DENY_DOMAINS'),
	PP_EXTENDED_ADMIN_URL: str('PP_EXTENDED_ADMIN_URL'),
	PP_EXTENDED_ADMIN_HMAC_SECRET: str('PP_EXTENDED_ADMIN_HMAC_SECRET'),
} as const

export const isProduction = env.NODE_ENV === 'production'
export const isLocalAuth = env.AUTH_MODE === 'none'

const BASE_REQUIRED = ['DATABASE_URL'] as const satisfies readonly (keyof typeof env)[]
const S3_REQUIRED = [
	'CDN_BUCKET_NAME',
	'CDN_ENDPOINT',
	'CDN_ACCESS_KEY_ID',
	'CDN_SECRET_ACCESS_KEY',
] as const satisfies readonly (keyof typeof env)[]
const RESEARCH_REQUIRED = ['TAVILY_API_KEY'] as const satisfies readonly (keyof typeof env)[]

export function validateEnv(): void {
	const required: readonly (keyof typeof env)[] = [
		...BASE_REQUIRED,
		...(env.STORAGE_DRIVER === 's3' ? S3_REQUIRED : []),
		...(env.RESEARCH_ENABLED ? RESEARCH_REQUIRED : []),
	]

	const missing = required.filter((key) => !env[key])
	if (missing.length > 0) {
		throw new Error(`🔑 Missing environment variable(s): ${missing.join(', ')}`)
	}

	if (isLocalAuth) {
		console.warn('🔓 AUTH_MODE=none - endpoint terbuka tanpa autentikasi. Jangan dipakai di produksi.')
	}
	console.info(
		`🔑 Environment validated | auth=${env.AUTH_MODE} | storage=${env.STORAGE_DRIVER} | research=${env.RESEARCH_ENABLED ? 'on' : 'off'}`,
	)
}
