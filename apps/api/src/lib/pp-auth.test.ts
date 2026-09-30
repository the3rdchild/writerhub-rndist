import { afterEach, beforeEach, describe, expect, setSystemTime, test } from 'bun:test'
import { env } from '@/config/env'
import { AppError } from '@/lib/error'
import { clearPpAuthCache, verifyPpBearerToken } from '@/lib/pp-auth'
import { resetPpBackendBreaker } from '@/lib/pp-backend-breaker'
import { clearExtendedPackageCache, getPpUserIdFromToken } from '@/lib/pp-backend-client'

const mutableEnv = env as unknown as Record<string, unknown>
const saved = {
	PP_BACKEND_URL: env.PP_BACKEND_URL,
	PP_AUTH_CHECK_URL: env.PP_AUTH_CHECK_URL,
	PP_AUTH_TIMEOUT_MS: env.PP_AUTH_TIMEOUT_MS,
	PP_API_KEY: env.PP_API_KEY,
}
const realFetch = globalThis.fetch

beforeEach(() => {
	mutableEnv.PP_BACKEND_URL = 'http://pp.test'
	mutableEnv.PP_AUTH_CHECK_URL = 'http://pp.test/auth/check'
	mutableEnv.PP_AUTH_TIMEOUT_MS = 3000
	mutableEnv.PP_API_KEY = 'kunci-uji'
	clearPpAuthCache()
	clearExtendedPackageCache()
	resetPpBackendBreaker()
})

afterEach(() => {
	Object.assign(mutableEnv, saved)
	globalThis.fetch = realFetch
	setSystemTime()
})

/** fetch tiruan yang mencatat URL-nya dan menjawab lewat `respond`. */
function stubFetch(respond: (url: string, init: RequestInit) => Promise<Response> | Response): string[] {
	const calls: string[] = []
	globalThis.fetch = (async (url: string, init: RequestInit) => {
		calls.push(String(url))
		return respond(String(url), init)
	}) as unknown as typeof fetch
	return calls
}

const authenticated = () => Response.json({ data: { authenticated: true, msg: 'ok' }, message: 'ok' })

describe('verifyPpBearerToken', () => {
	test('token yang sama hanya diverifikasi sekali selama umur cache', async () => {
		const calls = stubFetch(authenticated)

		for (let i = 0; i < 5; i++) {
			expect(await verifyPpBearerToken('Bearer token-a')).toBe('token-a')
		}

		expect(calls).toEqual(['http://pp.test/auth/check'])
	})

	test('verifikasi serentak untuk token yang sama berbagi satu panggilan', async () => {
		const calls = stubFetch(async () => {
			await Bun.sleep(5)
			return authenticated()
		})

		await Promise.all([
			verifyPpBearerToken('Bearer token-a'),
			verifyPpBearerToken('Bearer token-a'),
			verifyPpBearerToken('Bearer token-a'),
		])

		expect(calls.length).toBe(1)
	})

	test('token yang ditolak ditanyakan ulang, tidak disimpan', async () => {
		const calls = stubFetch(() =>
			Response.json({ data: { authenticated: false, msg: 'expired' }, message: 'no' }),
		)

		await expect(verifyPpBearerToken('Bearer token-b')).rejects.toBeInstanceOf(AppError)
		await expect(verifyPpBearerToken('Bearer token-b')).rejects.toBeInstanceOf(AppError)
		expect(calls.length).toBe(2)
	})

	test('pp-backend yang menggantung diputus dan dijawab 503', async () => {
		mutableEnv.PP_AUTH_TIMEOUT_MS = 30
		stubFetch(
			(_url, init) =>
				new Promise<Response>((_resolve, reject) => {
					init.signal?.addEventListener('abort', () => reject(init.signal?.reason))
				}),
		)

		const started = performance.now()
		const error = await verifyPpBearerToken('Bearer token-c').catch((caught) => caught)

		expect(error).toBeInstanceOf(AppError)
		expect((error as AppError).statusCode).toBe(503)
		expect(performance.now() - started).toBeLessThan(1_000)
	})
})

describe('pp-backend bermasalah', () => {
	test('5xx dijawab 503, bukan 401 yang menyuruh pengguna login ulang', async () => {
		stubFetch(() => new Response('galat', { status: 502 }))

		const error = await verifyPpBearerToken('Bearer token-g').catch((caught) => caught)
		expect((error as AppError).statusCode).toBe(503)
	})

	test('sesudah gagal beruntun, pp-backend dilewati sementara lalu dicoba lagi', async () => {
		setSystemTime(new Date('2026-09-30T00:00:00Z'))
		const calls = stubFetch(() => Promise.reject(new Error('ECONNREFUSED')))

		for (let i = 0; i < 5; i++) {
			await verifyPpBearerToken(`Bearer token-h${i}`).catch(() => undefined)
		}
		expect(calls.length).toBe(5)

		const error = await verifyPpBearerToken('Bearer token-h9').catch((caught) => caught)
		expect((error as AppError).statusCode).toBe(503)
		expect(await getPpUserIdFromToken('token-h9')).toBeNull()
		expect(calls.length).toBe(5)

		setSystemTime(new Date('2026-09-30T00:00:10.001Z'))
		stubFetch(authenticated)
		expect(await verifyPpBearerToken('Bearer token-h9')).toBe('token-h9')
	})

	test('sesudah jeda hanya satu percobaan yang diteruskan; gagal berarti jeda lagi', async () => {
		setSystemTime(new Date('2026-09-30T00:00:00Z'))
		const calls = stubFetch(() => Promise.reject(new Error('ECONNREFUSED')))
		for (let i = 0; i < 5; i++) {
			await verifyPpBearerToken(`Bearer token-i${i}`).catch(() => undefined)
		}

		setSystemTime(new Date('2026-09-30T00:00:10.001Z'))
		const results = await Promise.allSettled([
			verifyPpBearerToken('Bearer token-j1'),
			verifyPpBearerToken('Bearer token-j2'),
			verifyPpBearerToken('Bearer token-j3'),
		])
		expect(results.every((result) => result.status === 'rejected')).toBe(true)
		expect(calls.length).toBe(6)

		// Percobaannya gagal, jadi pemutus terbuka lagi tanpa menunggu lima kegagalan.
		await verifyPpBearerToken('Bearer token-j4').catch(() => undefined)
		expect(calls.length).toBe(6)
	})
})

describe('verifyPpBearerToken sesudah umur cache lewat', () => {
	const ttlMs = env.PP_AUTH_CACHE_TTL_S * 1000

	test('token yang dicabut ditolak begitu pemeriksaan ulang di latar selesai', async () => {
		setSystemTime(new Date('2026-09-30T00:00:00Z'))
		let authenticated = true
		const calls = stubFetch(() => Response.json({ data: { authenticated, msg: '' }, message: '' }))
		await verifyPpBearerToken('Bearer token-e')

		authenticated = false
		setSystemTime(new Date(Date.parse('2026-09-30T00:00:00Z') + ttlMs + 1))
		// Permintaan pemicu masih dilayani hasil lama, sementara pp-backend ditanya ulang.
		expect(await verifyPpBearerToken('Bearer token-e')).toBe('token-e')
		await Bun.sleep(1)

		await expect(verifyPpBearerToken('Bearer token-e')).rejects.toBeInstanceOf(AppError)
		expect(calls.length).toBe(3)
	})

	test('pp-backend yang mati tidak memutus pengguna yang sudah terverifikasi', async () => {
		setSystemTime(new Date('2026-09-30T00:00:00Z'))
		let down = false
		stubFetch(() => (down ? Promise.reject(new Error('ECONNREFUSED')) : authenticated()))
		await verifyPpBearerToken('Bearer token-f')

		down = true
		setSystemTime(new Date(Date.parse('2026-09-30T00:00:00Z') + ttlMs + 1))
		expect(await verifyPpBearerToken('Bearer token-f')).toBe('token-f')
		await Bun.sleep(1)
		expect(await verifyPpBearerToken('Bearer token-f')).toBe('token-f')
	})
})

describe('getPpUserIdFromToken', () => {
	const extendedPackage = (userId: unknown) =>
		Response.json({ data: { user_id: userId, username: 'u', user_email: 'u@x.id' }, message: 'ok' })

	test('mengambil user_id dari paket pemilik token, sekali per umur cache', async () => {
		const calls = stubFetch(() => extendedPackage('user-42'))

		expect(await getPpUserIdFromToken('token-a')).toBe('user-42')
		expect(await getPpUserIdFromToken('token-a')).toBe('user-42')
		expect(calls).toEqual(['http://pp.test/users/extended-package'])
	})

	test('user_id berupa angka dijadikan string', async () => {
		stubFetch(() => extendedPackage(42))
		expect(await getPpUserIdFromToken('token-a')).toBe('42')
	})

	test('paket yang gagal diambil tidak disimpan', async () => {
		let status = 500
		const calls = stubFetch(() =>
			status === 500 ? new Response('x', { status }) : extendedPackage('user-7'),
		)

		expect(await getPpUserIdFromToken('token-d')).toBeNull()
		status = 200
		expect(await getPpUserIdFromToken('token-d')).toBe('user-7')
		expect(calls.length).toBe(2)
	})
})
