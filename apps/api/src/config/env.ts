import 'dotenv/config'

const str = (key: string, fallback = ''): string => process.env[key] ?? fallback
const num = (key: string, fallback: number): number => Number(process.env[key]) || fallback

/**
 * Mode autentikasi.
 * - `pp`   : produksi — tanda tangan HMAC + verifikasi bearer ke pp-extended,
 *            provider LLM dan kuota diresolve dari admin-ppe.
 * - `none` : pengembangan lokal — tanpa kredensial sama sekali. Provider LLM
 *            diambil worker dari env-nya sendiri, kuota tidak dicatat.
 */
export type AuthMode = 'pp' | 'none'

/** Tempat menyimpan dokumen unggahan: object storage atau disk lokal. */
export type StorageDriver = 's3' | 'local'

/**
 * Seluruh env yang dibaca API, dikelompokkan per concern.
 * Nama variabel sengaja dipertahankan sama dengan deployment lama.
 */
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

	// ── penyimpanan dokumen ────────────────────────────────────────────────────
	STORAGE_DRIVER: (str('STORAGE_DRIVER', 's3') === 'local' ? 'local' : 's3') as StorageDriver,
	/** Driver `local`: folder tempat berkas ditulis. */
	STORAGE_DIR: str('STORAGE_DIR', './storage'),

	CDN_BUCKET_NAME: str('CDN_BUCKET_NAME'),
	CDN_ENDPOINT: str('CDN_ENDPOINT'),
	CDN_PUBLIC_URL: str('CDN_PUBLIC_URL'),
	CDN_ACCESS_KEY_ID: str('CDN_ACCESS_KEY_ID'),
	CDN_SECRET_ACCESS_KEY: str('CDN_SECRET_ACCESS_KEY'),
	CDN_REGION: str('CDN_REGION', 'us-east-1'),
	/** true untuk backend yang mendukung object ACL (AWS S3, DO Spaces). MinIO/R2: biarkan kosong. */
	S3_USE_OBJECT_ACL: str('S3_USE_OBJECT_ACL') === 'true',

	GRAMMAR_QUEUE_NAME: str('GRAMMAR_QUEUE_NAME', 'GRAMMAR_QUEUE'),
	GRAMMAR_JOB_NAME: str('GRAMMAR_JOB_NAME', 'PROCESS_GRAMMAR'),
	ANALYSIS_QUEUE_NAME: str('ANALYSIS_QUEUE_NAME', 'ANALYSIS_QUEUE'),
	ANALYSIS_JOB_NAME: str('ANALYSIS_JOB_NAME', 'PROCESS_ANALYSIS'),

	/**
	 * Paksa semua job grammar ke satu tier engine. Produksi memakai `ai` karena
	 * provider berasal dari admin-ppe; kosongkan agar pilihan model dari klien
	 * dipakai apa adanya (`standard`/`advanced` berjalan tanpa LLM).
	 */
	GRAMMAR_FORCE_MODEL: str('GRAMMAR_FORCE_MODEL', 'ai'),

	// ── Auth: verifikasi request dari pp-extended / klien lain ──
	/** Secret HMAC yang dicocokkan dua sisi dengan pp-extended. */
	PP_API_KEY: str('PP_API_KEY'),
	PP_BACKEND_URL: str('PP_BACKEND_URL'),
	PP_AUTH_CHECK_URL: str('PP_AUTH_CHECK_URL'),
	/** Klien `another-client` (header x-api-key). */
	API_KEYS: str('API_KEYS'),
	/** Klien `ransel-ai` (header x-ransel-ai-api-key). */
	RANSEL_AI_API_KEY: str('RANSEL_AI_API_KEY'),

	// ── admin-ppe: resolusi provider LLM & pencatatan kuota/token ──
	PP_EXTENDED_ADMIN_URL: str('PP_EXTENDED_ADMIN_URL'),
	PP_EXTENDED_ADMIN_HMAC_SECRET: str('PP_EXTENDED_ADMIN_HMAC_SECRET'),
} as const

export const isProduction = env.NODE_ENV === 'production'
export const isLocalAuth = env.AUTH_MODE === 'none'

const BASE_REQUIRED = ['DATABASE_URL'] as const satisfies readonly (keyof typeof env)[]

/** Kredensial object storage hanya wajib saat driver `s3` dipakai. */
const S3_REQUIRED = [
	'CDN_BUCKET_NAME',
	'CDN_ENDPOINT',
	'CDN_ACCESS_KEY_ID',
	'CDN_SECRET_ACCESS_KEY',
] as const satisfies readonly (keyof typeof env)[]

export function validateEnv(): void {
	const required: readonly (keyof typeof env)[] =
		env.STORAGE_DRIVER === 's3' ? [...BASE_REQUIRED, ...S3_REQUIRED] : BASE_REQUIRED

	const missing = required.filter((key) => !env[key])
	if (missing.length > 0) {
		throw new Error(`🔑 Missing environment variable(s): ${missing.join(', ')}`)
	}

	if (isLocalAuth) {
		console.warn('🔓 AUTH_MODE=none — endpoint terbuka tanpa autentikasi. Jangan dipakai di produksi.')
	}
	console.info(`🔑 Environment validated | auth=${env.AUTH_MODE} | storage=${env.STORAGE_DRIVER}`)
}
