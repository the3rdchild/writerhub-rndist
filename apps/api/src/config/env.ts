import 'dotenv/config'

export type AuthMode = 'pp' | 'none'
export type StorageDriver = 's3' | 'local'

const str = (key: string, fallback = ''): string => process.env[key] ?? fallback

/**
 * Nilai kosong dan yang bukan angka jatuh ke fallback, tapi "0" tidak.
 * Versi sebelumnya memakai `Number(...) || fallback`, sehingga setelan yang
 * sengaja dimatikan lewat 0 - misalnya TTL cache - diam-diam berubah kembali
 * menjadi nilai bawaan.
 */
const num = (key: string, fallback: number): number => {
	const raw = process.env[key]
	if (raw === undefined || raw.trim() === '') return fallback

	const parsed = Number(raw)
	return Number.isFinite(parsed) ? parsed : fallback
}

const bool = (key: string, fallback = false): boolean => {
	const raw = process.env[key]
	if (raw === undefined || raw.trim() === '') return fallback

	return raw === 'true'
}

/** Enum sempit: nilai di luar daftar dianggap salah ketik dan jatuh ke fallback. */
const oneOf = <T extends string>(key: string, allowed: readonly T[], fallback: T): T => {
	const raw = process.env[key]
	return allowed.includes(raw as T) ? (raw as T) : fallback
}

export const env = {
	// ── Runtime & jaringan ──────────────────────────────────────────────────
	NODE_ENV: str('NODE_ENV', 'development'),
	PORT: num('PORT', 8080),
	ORIGIN: str('ORIGIN', '*'),
	SERVICE_URL: str('SERVICE_URL', 'http://localhost:8080'),

	// ── Autentikasi ─────────────────────────────────────────────────────────
	AUTH_MODE: oneOf<AuthMode>('AUTH_MODE', ['pp', 'none'], 'pp'),
	PP_API_KEY: str('PP_API_KEY'),
	PP_BACKEND_URL: str('PP_BACKEND_URL'),
	PP_AUTH_CHECK_URL: str('PP_AUTH_CHECK_URL'),
	API_KEYS: str('API_KEYS'),
	RANSEL_AI_API_KEY: str('RANSEL_AI_API_KEY'),

	// ── admin-ppe: provider LLM & kuota ─────────────────────────────────────
	PP_EXTENDED_ADMIN_URL: str('PP_EXTENDED_ADMIN_URL'),
	PP_EXTENDED_ADMIN_HMAC_SECRET: str('PP_EXTENDED_ADMIN_HMAC_SECRET'),

	// ── Basis data & Redis ──────────────────────────────────────────────────
	DATABASE_URL: str('DATABASE_URL'),
	REDIS_HOST: str('REDIS_HOST', 'localhost'),
	REDIS_PORT: num('REDIS_PORT', 6379),
	REDIS_PASSWORD: str('REDIS_PASSWORD'),

	// ── Penyimpanan dokumen ─────────────────────────────────────────────────
	STORAGE_DRIVER: oneOf<StorageDriver>('STORAGE_DRIVER', ['s3', 'local'], 's3'),
	STORAGE_DIR: str('STORAGE_DIR', './storage'),
	CDN_BUCKET_NAME: str('CDN_BUCKET_NAME'),
	CDN_ENDPOINT: str('CDN_ENDPOINT'),
	// Belum ada yang membacanya: berkas selalu disajikan lewat presigned URL
	// dari lib/cdn.ts. Dipertahankan karena kemungkinan sudah diset di
	// konfigurasi deployment.
	CDN_PUBLIC_URL: str('CDN_PUBLIC_URL'),
	CDN_ACCESS_KEY_ID: str('CDN_ACCESS_KEY_ID'),
	CDN_SECRET_ACCESS_KEY: str('CDN_SECRET_ACCESS_KEY'),
	CDN_REGION: str('CDN_REGION', 'us-east-1'),
	S3_USE_OBJECT_ACL: bool('S3_USE_OBJECT_ACL'),

	// ── Antrean worker (nama harus sama persis dengan services/worker) ──────
	GRAMMAR_QUEUE_NAME: str('GRAMMAR_QUEUE_NAME', 'GRAMMAR_QUEUE'),
	GRAMMAR_JOB_NAME: str('GRAMMAR_JOB_NAME', 'PROCESS_GRAMMAR'),
	ANALYSIS_QUEUE_NAME: str('ANALYSIS_QUEUE_NAME', 'ANALYSIS_QUEUE'),
	ANALYSIS_JOB_NAME: str('ANALYSIS_JOB_NAME', 'PROCESS_ANALYSIS'),
	GRAMMAR_FORCE_MODEL: str('GRAMMAR_FORCE_MODEL', 'ai'),

	// ── Provider AI cadangan ────────────────────────────────────────────────
	// Dipakai saat provider dari admin-ppe tidak tersedia - termasuk seluruh
	// mode AUTH_MODE=none, yang memang tidak pernah memanggil admin-ppe.
	AI_BASE_URL: str('AI_BASE_URL', 'https://openrouter.ai/api/v1'),
	AI_API_KEY: str('AI_API_KEY'),
	AI_MODEL: str('AI_MODEL', 'openai/gpt-4o-mini'),

	// ── Riset web (Tavily) ──────────────────────────────────────────────────
	TAVILY_API_KEY: str('TAVILY_API_KEY'),
	RESEARCH_ENABLED: str('RESEARCH_ENABLED', 'true') !== 'false',
	RESEARCH_MAX_RESULTS: num('RESEARCH_MAX_RESULTS', 8),
	RESEARCH_RESULT_CHARS: num('RESEARCH_RESULT_CHARS', 50_000),
	RESEARCH_CACHE_TTL_NEWS: num('RESEARCH_CACHE_TTL_NEWS', 10_800),
	RESEARCH_CACHE_TTL_GENERAL: num('RESEARCH_CACHE_TTL_GENERAL', 86_400),
	RESEARCH_DENY_DOMAINS: str('RESEARCH_DENY_DOMAINS'),
	// Anggaran per giliran chat yang dijelaskan di docs/WEB-RESEARCH-PLAN.md.
	// Nilainya terbaca tapi belum ada yang menegakkannya - lihat catatan di
	// bawah pada validateEnv.
	RESEARCH_MAX_SEARCHES: num('RESEARCH_MAX_SEARCHES', 5),
	RESEARCH_MAX_EXTRACTS: num('RESEARCH_MAX_EXTRACTS', 8),
	RESEARCH_MAX_ROUNDS: num('RESEARCH_MAX_ROUNDS', 20),
} as const

export type Env = typeof env
export type EnvKey = keyof Env

export const isProduction = env.NODE_ENV === 'production'
export const isLocalAuth = env.AUTH_MODE === 'none'

const BASE_REQUIRED = ['DATABASE_URL'] as const satisfies readonly EnvKey[]
const S3_REQUIRED = [
	'CDN_BUCKET_NAME',
	'CDN_ENDPOINT',
	'CDN_ACCESS_KEY_ID',
	'CDN_SECRET_ACCESS_KEY',
] as const satisfies readonly EnvKey[]
const RESEARCH_REQUIRED = ['TAVILY_API_KEY'] as const satisfies readonly EnvKey[]

function requiredKeys(): readonly EnvKey[] {
	return [
		...BASE_REQUIRED,
		...(env.STORAGE_DRIVER === 's3' ? S3_REQUIRED : []),
		...(env.RESEARCH_ENABLED ? RESEARCH_REQUIRED : []),
	]
}

export function validateEnv(): void {
	const missing = requiredKeys().filter((key) => !env[key])
	if (missing.length > 0) {
		throw new Error(`🔑 Missing environment variable(s): ${missing.join(', ')}`)
	}

	if (isLocalAuth) {
		console.warn('🔓 AUTH_MODE=none - endpoint terbuka tanpa autentikasi. Jangan dipakai di produksi.')

		// Tanpa admin-ppe, satu-satunya sumber kredensial chat adalah AI_API_KEY.
		// Kalau kosong, /chat baru gagal saat permintaan pertama dengan 503 tanpa
		// petunjuk apa pun - jadi diperingatkan sejak boot.
		if (!env.AI_API_KEY) {
			console.warn('🤖 AI_API_KEY kosong - chat akan membalas 503 karena tidak ada provider cadangan.')
		}
	} else if (!env.PP_API_KEY) {
		// Sengaja peringatan, bukan galat. AUTH_MODE=pp juga melayani klien
		// 'ransel-ai' dan 'another-client' yang tidak menyentuh pp-extended sama
		// sekali, jadi deployment tanpa kredensial PP tetap sah.
		console.warn('🔐 PP_API_KEY kosong - klien pp-extended akan selalu ditolak 401.')
	}

	console.info(
		`🔑 Environment validated | auth=${env.AUTH_MODE} | storage=${env.STORAGE_DRIVER} | research=${env.RESEARCH_ENABLED ? 'on' : 'off'}`,
	)
}
