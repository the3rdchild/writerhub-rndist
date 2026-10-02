import type { Context } from 'hono'
import { createMiddleware } from 'hono/factory'
import { RedisClient } from '@/config/redis'
import type { AppEnv } from '@/lib/create-app'
import LoggerClient from '@/lib/logger'

const WINDOW_MS = 60_000
/**
 * Batas tunggu Redis. Klien Redis dipasang dengan `maxRetriesPerRequest:
 * null`, jadi tanpa batas ini perintahnya menunggu selamanya saat Redis mati,
 * dan setiap permintaan chat/grammar/draf ikut menggantung.
 */
const REDIS_TIMEOUT_MS = 250

/**
 * Batas permintaan per pengguna per menit (jendela tetap per menit jam
 * dinding) untuk rute yang mahal: chat, grammar, dan draf.
 *
 * Hitungannya di Redis supaya berlaku lintas proses dan replika. Kalau Redis
 * tidak menjawab, permintaan tetap diloloskan. Pembatas yang mati tidak boleh
 * menjatuhkan fitur yang dibatasinya.
 *
 * Yang dibatasi adalah pengguna, bukan klien. Permintaan tanpa identitas
 * (klien server-ke-server `another-client`) tidak dihitung, karena satu
 * ember untuk seluruh integrasi akan memblokir semua penggunanya sekaligus.
 *
 * Dipasang sesudah `authMiddleware`, yang mengisi `userId`.
 */
export function rateLimit(
	bucket: string,
	label: string,
	limitPerMinute: number,
	/**
	 * Siapa yang dihitung. Bawaannya pengguna dari `authMiddleware`; rute tanpa
	 * sesi (mis. tiket lewat tautan berbagi) memberi kuncinya sendiri. Kosong =
	 * tidak dihitung.
	 */
	subjectOf: (c: Context<AppEnv>) => string | null | undefined = (c) => {
		const userId = c.get('userId')
		return userId ? `${c.get('identityOrigin') ?? '-'}:${userId}` : null
	},
) {
	return createMiddleware<AppEnv>(async (c, next) => {
		const subject = subjectOf(c)
		if (limitPerMinute <= 0 || !subject) return next()

		const now = Date.now()
		const window = Math.floor(now / WINDOW_MS)
		const key = `ratelimit:${bucket}:${subject}:${window}`
		const count = await increment(key)

		if (count !== null && count > limitPerMinute) {
			const retryAfter = Math.max(1, Math.ceil(((window + 1) * WINDOW_MS - now) / 1000))
			c.header('Retry-After', String(retryAfter))
			return c.json(
				{
					message: 'Terlalu banyak permintaan',
					errors: [
						`Batas ${limitPerMinute} ${label} per menit tercapai. Coba lagi dalam ${retryAfter} detik.`,
					],
				},
				429,
			)
		}

		await next()
	})
}

/** Hitungan jendela ini sesudah ditambah satu, atau null bila Redis tidak menjawab tepat waktu. */
async function increment(key: string): Promise<number | null> {
	let timer: ReturnType<typeof setTimeout> | undefined
	try {
		const counted = RedisClient.getInstance()
			.multi()
			.incr(key)
			.pexpire(key, WINDOW_MS * 2)
			.exec()
			.then((results) => {
				const value = results?.[0]?.[1]
				return typeof value === 'number' ? value : null
			})
		const timedOut = new Promise<null>((resolve) => {
			timer = setTimeout(() => resolve(null), REDIS_TIMEOUT_MS)
		})
		return await Promise.race([counted, timedOut])
	} catch (error) {
		LoggerClient.getInstance().warn({ err: error, key }, 'Rate limit dilewati: Redis gagal')
		return null
	} finally {
		clearTimeout(timer)
	}
}
