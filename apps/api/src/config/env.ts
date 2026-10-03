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
	// Alamat apps/web sebagaimana dibuka pengguna - dipakai menyusun tautan
	// dokumen yang dikembalikan ke klien eksternal (lihat services/drafts).
	WEB_URL: str('WEB_URL', 'http://localhost:8090'),
	/**
	 * Jumlah proses API di satu kontainer, berbagi port lewat `reusePort`
	 * (lihat `src/index.ts`). Bun menjalankan JS di satu thread, jadi satu
	 * proses mentok di ±1,25 core: pada uji beban 30 Sep, API jebol di ±765
	 * req/dtk sementara core lain menganggur. Semua state bersama ada di
	 * Postgres/Redis, jadi proses tambahan aman. Cache di memori (auth,
	 * identitas) dimiliki tiap proses.
	 */
	API_PROCESSES: num('API_PROCESSES', 1),

	// ── Autentikasi ─────────────────────────────────────────────────────────
	AUTH_MODE: oneOf<AuthMode>('AUTH_MODE', ['pp', 'none'], 'pp'),
	PP_API_KEY: str('PP_API_KEY'),
	PP_BACKEND_URL: str('PP_BACKEND_URL'),
	PP_AUTH_CHECK_URL: str('PP_AUTH_CHECK_URL'),
	API_KEYS: str('API_KEYS'),
	RANSEL_AI_API_KEY: str('RANSEL_AI_API_KEY'),
	/**
	 * Umur hasil tanya ke pp-backend per token, dalam detik: verifikasi
	 * `/auth/check` dan paket `/users/extended-package`. Tanpa cache, setiap
	 * permintaan WritingHub menjadi satu permintaan ke pp-backend. Pada uji
	 * beban, pp-backend yang melambat ke 3 dtk membuat p95 WritingHub menjadi
	 * 12 dtk. Batas atasnya juga lamanya token yang sudah dicabut masih
	 * diterima. `0` mematikan cache.
	 */
	PP_AUTH_CACHE_TTL_S: num('PP_AUTH_CACHE_TTL_S', 60),
	/**
	 * Sesudah `PP_AUTH_CACHE_TTL_S` lewat, hasil lama masih dipakai selama
	 * sekian detik sementara pp-backend ditanya ulang di latar. Dengan begitu
	 * pengguna aktif tidak pernah menunggu pp-backend yang lambat. Token yang
	 * ditolak saat ditanya ulang langsung dibuang. Jendela ini hanya berlaku
	 * penuh saat pp-backend tidak terjangkau, dan pengguna yang sudah
	 * terverifikasi tetap terlayani selama itu. `0` mematikannya.
	 */
	PP_AUTH_STALE_S: num('PP_AUTH_STALE_S', 300),
	/**
	 * Batas waktu satu panggilan ke pp-backend. Tanpa batas ini, pp-backend
	 * yang menggantung membuat semua permintaan ikut menggantung. Lewat batas,
	 * permintaannya dibalas 503.
	 *
	 * Sengaja cukup longgar: berkat cache, yang menunggu pp-backend hanya
	 * permintaan pertama sebuah token dan pemeriksaan ulang di latar. Batas
	 * yang terlalu ketat justru menolak pengguna saat pp-backend lambat tetapi
	 * masih menjawab. Kegagalan beruntun ditangani pemutus sirkuit
	 * (`lib/pp-backend-breaker.ts`).
	 */
	PP_AUTH_TIMEOUT_MS: num('PP_AUTH_TIMEOUT_MS', 5000),

	// ── admin-ppe: provider LLM & kuota ─────────────────────────────────────
	PP_EXTENDED_ADMIN_URL: str('PP_EXTENDED_ADMIN_URL'),
	PP_EXTENDED_ADMIN_HMAC_SECRET: str('PP_EXTENDED_ADMIN_HMAC_SECRET'),

	// ── Batas permintaan ────────────────────────────────────────────────────
	/**
	 * Ukuran maksimal badan permintaan yang membawa naskah (buat dokumen,
	 * buat/simpan tab), dalam megabyte. Tanpa batas, Bun menerima sampai
	 * 128 MB, dan setiap simpanan juga menjadi snapshot versi. Longgar dengan
	 * sengaja: editor menyematkan gambar unggahan (maks 5 MB per gambar) sebagai
	 * base64 di dalam naskah, jadi batas 5 MB akan memblokir dokumen bergambar.
	 */
	CONTENT_MAX_MB: num('CONTENT_MAX_MB', 25),
	/**
	 * Batas permintaan per pengguna per menit, dihitung di Redis sehingga
	 * berlaku lintas proses dan replika. `0` mematikannya. Satu giliran chat
	 * bertool bisa berisi 10-20 permintaan (satu per putaran tool), jadi batas
	 * chat sengaja paling longgar.
	 */
	RATE_LIMIT_CHAT_PER_MIN: num('RATE_LIMIT_CHAT_PER_MIN', 60),
	RATE_LIMIT_GRAMMAR_PER_MIN: num('RATE_LIMIT_GRAMMAR_PER_MIN', 20),
	RATE_LIMIT_DRAFTS_PER_MIN: num('RATE_LIMIT_DRAFTS_PER_MIN', 10),
	/**
	 * Tiket kolaborasi lewat tautan berbagi, per TAUTAN per menit. Rute itu
	 * tanpa sesi (tokennya izinnya), jadi tidak ada pengguna untuk dihitung;
	 * yang dibatasi adalah satu tautan. Setiap peramban meminta tiket saat
	 * menyambung dan sekali per jam sesudahnya, jadi angka ini longgar.
	 */
	RATE_LIMIT_SHARE_TICKETS_PER_MIN: num('RATE_LIMIT_SHARE_TICKETS_PER_MIN', 120),
	/**
	 * Tiket kolaborasi pemilik, per pengguna per menit. Klien yang tiketnya
	 * terus ditolak tidak boleh membanjiri penerbitan tiket walau jeda
	 * sambung-ulangnya rusak; pemakaian wajar beberapa tiket per tab per jam.
	 */
	RATE_LIMIT_COLLAB_TICKETS_PER_MIN: num('RATE_LIMIT_COLLAB_TICKETS_PER_MIN', 120),

	// ── Basis data & Redis ──────────────────────────────────────────────────
	DATABASE_URL: str('DATABASE_URL'),
	REDIS_HOST: str('REDIS_HOST', 'localhost'),
	REDIS_PORT: num('REDIS_PORT', 6379),
	REDIS_PASSWORD: str('REDIS_PASSWORD'),
	/**
	 * Indeks basis data Redis. Kunci (antrean job, cache, kunci penyemaian
	 * kolaborasi) terpisah per indeks, tetapi kanal pub/sub TIDAK - kanal
	 * berlaku lintas indeks, jadi pemisahnya `COLLAB_REDIS_PREFIX`.
	 */
	REDIS_DB: num('REDIS_DB', 0),
	/**
	 * Koneksi Postgres maksimal per proses API. Selaraskan dengan
	 * `max_connections` Postgres: totalnya adalah nilai ini × `API_PROCESSES`
	 * × jumlah replika, ditambah worker.
	 */
	DB_POOL_MAX: num('DB_POOL_MAX', 10),
	/**
	 * Umur id identitas di memori, dalam detik. Tanpa cache, setiap
	 * permintaan (termasuk GET) menjalankan upsert ke tabel `identity`: satu
	 * tulis Postgres per permintaan.
	 */
	IDENTITY_CACHE_TTL_S: num('IDENTITY_CACHE_TTL_S', 600),

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

	// ── Aset gambar milik proyek ────────────────────────────────────────────
	/**
	 * Kunci HMAC untuk URL aset bertanda tangan. Sengaja terpisah dari rahasia
	 * autentikasi: URL aset dibagikan ke bingkai berasal-opaque dan berumur
	 * pendek, jadi ia punya profil risiko sendiri dan harus bisa dirotasi
	 * sendiri. Kosong berarti penerbitan URL menolak bekerja, bukan diam-diam
	 * memakai kunci lemah.
	 */
	ASSET_URL_SECRET: str('ASSET_URL_SECRET'),
	/** Umur URL aset dalam detik. Cukup untuk merender, terlalu pendek untuk dibagikan. */
	ASSET_URL_TTL_SECONDS: num('ASSET_URL_TTL_SECONDS', 900),
	/** Batas ukuran satu berkas aset, dalam megabyte. */
	ASSET_MAX_MB: num('ASSET_MAX_MB', 3),
	/**
	 * Batas jumlah aset per proyek. Bukan penagihan melainkan rem: tanpa angka
	 * apa pun, satu unggahan massal yang keliru bisa mengisi bucket tanpa ada
	 * yang menyadarinya sampai tagihannya datang.
	 */
	ASSET_MAX_PER_PROJECT: num('ASSET_MAX_PER_PROJECT', 500),

	// ── Render berkas di server ─────────────────────────────────────────────
	/**
	 * Umur token rute ekspor. Sangat pendek dengan sengaja: ia hanya perlu
	 * bertahan selama satu kunjungan peramban worker, dan token yang bocor
	 * membuka isi satu dokumen sampai ia kedaluwarsa.
	 */
	RENDER_TOKEN_TTL_SECONDS: num('RENDER_TOKEN_TTL_SECONDS', 300),
	/** Nama antrean render - harus sama persis dengan `services/worker`. */
	RENDER_QUEUE_NAME: str('RENDER_QUEUE_NAME', 'RENDER_QUEUE'),
	RENDER_JOB_NAME: str('RENDER_JOB_NAME', 'RENDER_DOCUMENT'),
	/** Plafon halaman satu render; berlaku semua orang, bukan soal tier. */
	RENDER_MAX_PAGES: num('RENDER_MAX_PAGES', 50),
	/** Sesudah sekian detik mengantre, job rendernya dilepas. */
	RENDER_QUEUE_TIMEOUT_S: num('RENDER_QUEUE_TIMEOUT_S', 300),
	/** Tenggat satu render; sesudahnya halamannya dimatikan dan slotnya bebas. */
	RENDER_PAGE_TIMEOUT_S: num('RENDER_PAGE_TIMEOUT_S', 120),
	/**
	 * Umur URL unduh hasil render. Harus lebih pendek dari lifecycle objeknya
	 * (1 hari): URL yang diterbitkan di jam ke-23 tidak boleh mati setelah
	 * objeknya - atau sebaliknya, mengungguli pembersihannya.
	 */
	EXPORT_URL_TTL_S: num('EXPORT_URL_TTL_S', 43_200),

	// ── Kolaborasi real-time (Yjs lewat websocket, docs/collab-realtime.md) ──
	/**
	 * Kunci HMAC tiket websocket. Kosong berarti kolaborasi mati: penerbitan
	 * tiket dijawab 503 dan klien tetap memakai simpanan lama (PUT per tab).
	 * Harus sama di semua proses dan replika - tiket yang diterbitkan satu
	 * replika dipakai membuka websocket di replika lain.
	 */
	COLLAB_TICKET_SECRET: str('COLLAB_TICKET_SECRET'),
	/** Umur tiket untuk MEMBUKA sambungan, dalam detik. Sambungan yang sudah terbuka tidak ikut putus. */
	COLLAB_TICKET_TTL_S: num('COLLAB_TICKET_TTL_S', 60),
	/**
	 * Sambungan yang sudah hidup selama ini ditutup dengan kode 4401 supaya
	 * klien mengambil tiket baru: batas atas lamanya akses yang sudah dicabut
	 * (token login kedaluwarsa, tab dipindah) masih berlaku. `0` mematikannya.
	 */
	COLLAB_REAUTH_S: num('COLLAB_REAUTH_S', 3600),
	/**
	 * Awalan kanal pub/sub dan kunci Redis milik kolaborasi. Kanal pub/sub
	 * berlaku lintas indeks DB, jadi lingkungan yang berbagi satu Redis harus
	 * memakai awalan berbeda.
	 */
	COLLAB_REDIS_PREFIX: str('COLLAB_REDIS_PREFIX', 'writer-hub:collab:'),
	/**
	 * Alamat websocket yang dibuka peramban. Kosong berarti diturunkan dari
	 * `SERVICE_URL` (http→ws) + `/api/v1/collab/ws`. Isi bila websocket
	 * dirutekan lewat host lain, mis. host web dengan aturan ingress khusus.
	 */
	COLLAB_PUBLIC_WS_URL: str('COLLAB_PUBLIC_WS_URL'),
	/** Room tanpa sambungan dilepas dari memori setelah sekian detik. */
	COLLAB_ROOM_IDLE_S: num('COLLAB_ROOM_IDLE_S', 30),
	/**
	 * Jeda tenang sebelum `document_tabs.content` diturunkan ulang dari state
	 * Yjs, dan batas atas tundaannya selama suntingan terus mengalir (ms).
	 */
	COLLAB_DERIVE_DEBOUNCE_MS: num('COLLAB_DERIVE_DEBOUNCE_MS', 2000),
	COLLAB_DERIVE_MAX_MS: num('COLLAB_DERIVE_MAX_MS', 10_000),
	/** Batas satu pesan websocket (MB); harus muat naskah awal terbesar (lihat `CONTENT_MAX_MB`). */
	COLLAB_MAX_MESSAGE_MB: num('COLLAB_MAX_MESSAGE_MB', 32),

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
	AI_MODEL: str('AI_MODEL', 'deepseek/deepseek-v4-flash-0731'),
	/**
	 * `AI_BASE_URL` adalah proksi ke OpenRouter (mis. adapter lokal), jadi ia
	 * juga memilih model per permintaan dan mengenal saklar `reasoning`. Tidak
	 * perlu untuk URL openrouter.ai - yang itu dikenali dari hostnya.
	 */
	AI_BASE_URL_OPENROUTER: bool('AI_BASE_URL_OPENROUTER'),
	/**
	 * Urutan provider OpenRouter yang diutamakan untuk chat, dipisah koma
	 * (misalnya `deepinfra,baseten`). Kosong berarti perutean bawaan
	 * OpenRouter.
	 *
	 * Cache prompt hanya berlaku di dalam satu provider. Prompt chat bertool
	 * ±16 ribu token dan ±98% di antaranya bisa dilayani cache bila provider-nya
	 * sama, tetapi OpenRouter menyebar model ini ke belasan provider. Uji
	 * 30 Sep: tanpa pengutamaan, sebagian besar permintaan berurutan jatuh ke
	 * provider berbeda dan cache-nya kosong. Provider cadangan tetap diizinkan.
	 */
	AI_PROVIDER_ORDER: str('AI_PROVIDER_ORDER'),
	/**
	 * Batas waktu satu panggilan ke provider AI. Tanpa ini yang menentukan
	 * adalah timeout bawaan runtime - batas yang tidak kita pilih, tidak sama
	 * antar versi Bun, dan pesan galatnya bukan milik kita.
	 *
	 * Longgar dengan sengaja: satu giliran chat yang menulis panjang memang
	 * bisa berjalan menit-menitan, dan memotongnya di tengah lebih buruk
	 * daripada menunggu. Ini batas total satu giliran; provider yang diam
	 * diputus lebih cepat oleh `AI_IDLE_TIMEOUT_MS`.
	 */
	AI_REQUEST_TIMEOUT_MS: num('AI_REQUEST_TIMEOUT_MS', 600_000),
	/**
	 * Jeda terlama tanpa satu potongan pun dari provider, termasuk menunggu
	 * header. Potongan penalaran dan komentar keep-alive ikut dihitung, jadi
	 * model yang masih berpikir tidak diputus (lihat `chat/deadline.ts`).
	 */
	AI_IDLE_TIMEOUT_MS: num('AI_IDLE_TIMEOUT_MS', 90_000),

	// ── Riset web (Tavily) ──────────────────────────────────────────────────
	TAVILY_API_KEY: str('TAVILY_API_KEY'),
	RESEARCH_ENABLED: str('RESEARCH_ENABLED', 'true') !== 'false',
	RESEARCH_MAX_RESULTS: num('RESEARCH_MAX_RESULTS', 8),
	RESEARCH_RESULT_CHARS: num('RESEARCH_RESULT_CHARS', 50_000),
	RESEARCH_CACHE_TTL_NEWS: num('RESEARCH_CACHE_TTL_NEWS', 10_800),
	RESEARCH_CACHE_TTL_GENERAL: num('RESEARCH_CACHE_TTL_GENERAL', 86_400),
	RESEARCH_DENY_DOMAINS: str('RESEARCH_DENY_DOMAINS'),
	// Anggaran per giliran chat.
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

	if (!env.COLLAB_TICKET_SECRET) {
		console.warn(
			'🤝 COLLAB_TICKET_SECRET kosong - kolaborasi real-time nonaktif, tab disimpan lewat PUT seperti dulu.',
		)
	}

	console.info(
		`🔑 Environment validated | auth=${env.AUTH_MODE} | storage=${env.STORAGE_DRIVER} | research=${env.RESEARCH_ENABLED ? 'on' : 'off'} | collab=${env.COLLAB_TICKET_SECRET ? 'on' : 'off'}`,
	)
}
