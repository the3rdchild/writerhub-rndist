import { env } from '@/config/env'
import LoggerClient from '@/lib/logger'
import { tokenCacheKey } from '@/lib/pp-auth'
import { isPpBackendAvailable, recordPpBackendResult } from '@/lib/pp-backend-breaker'
import { signPpApiKey } from '@/lib/pp-signature'
import { TtlCache } from '@/lib/ttl-cache'

const log = LoggerClient.getInstance()

export interface ExtendedUserPackage {
	user_id: string
	username: string
	user_email: string
	_id: string
	name: string
	category_name: string
	extended_expires_at: string
}

interface ExtendedUserPackageResponse {
	data: ExtendedUserPackage
	message: string
}

/**
 * Paket per token, dikunci dan berumur sama dengan verifikasi token
 * (`lib/pp-auth.ts`). Jawaban `null` (hulu gagal atau pengguna tanpa paket)
 * tidak disimpan, jadi ditanyakan ulang pada permintaan berikutnya, dan tidak
 * menimpa paket lama yang masih dalam jendela basi.
 */
const packages = new TtlCache<ExtendedUserPackage | null>({
	ttlMs: env.PP_AUTH_CACHE_TTL_S * 1000,
	staleMs: env.PP_AUTH_STALE_S * 1000,
	maxEntries: 20_000,
})

export async function getExtendedUserPackage(token: string): Promise<ExtendedUserPackage | null> {
	if (!env.PP_BACKEND_URL) {
		log.warn('[pp-backend] PP_BACKEND_URL belum dikonfigurasi, lewati getExtendedUserPackage')
		return null
	}
	if (!token) return null

	return packages.getOrLoad(
		tokenCacheKey(token),
		() => fetchExtendedUserPackage(token),
		(pkg) => pkg !== null,
	)
}

/**
 * Id pengguna PPE pemilik token, diambil dari paketnya.
 *
 * `/auth/check` hanya menjawab sah atau tidak, tanpa menyebut siapa
 * pemiliknya. Karena itu permintaan dari browser (lewat proxy `apps/web`, yang
 * tidak mengirim `x-pp-user-id`) mengambil identitasnya dari sini.
 */
export async function getPpUserIdFromToken(token: string): Promise<string | null> {
	const pkg = await getExtendedUserPackage(token)
	const userId = pkg?.user_id
	return userId === undefined || userId === null || userId === '' ? null : String(userId)
}

async function fetchExtendedUserPackage(token: string): Promise<ExtendedUserPackage | null> {
	if (!isPpBackendAvailable()) return null

	try {
		const { signature, timestamp } = signPpApiKey()
		const res = await fetch(`${env.PP_BACKEND_URL}/users/extended-package`, {
			method: 'GET',
			headers: {
				authorization: `Bearer ${token}`,
				'x-pp-api-key': signature,
				'x-pp-timestamp': timestamp,
				'x-client': 'pp-extended',
			},
			signal: AbortSignal.timeout(env.PP_AUTH_TIMEOUT_MS),
		})

		recordPpBackendResult(res.status < 500)
		if (!res.ok) {
			log.warn({ status: res.status }, '[pp-backend] getExtendedUserPackage gagal')
			return null
		}

		const body = (await res.json()) as ExtendedUserPackageResponse
		return body.data ?? null
	} catch (err) {
		recordPpBackendResult(false)
		log.error({ err }, '[pp-backend] getExtendedUserPackage error')
		return null
	}
}

/** Untuk uji: melupakan semua paket yang tersimpan. */
export function clearExtendedPackageCache(): void {
	packages.clear()
}
