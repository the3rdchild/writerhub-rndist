import { afterEach, describe, expect, test } from 'bun:test'
import { Hono } from 'hono'
import { RedisClient } from '@/config/redis'
import type { AppEnv } from '@/lib/create-app'
import { rateLimit } from '@/middlewares/rate-limit'

const realGetInstance = RedisClient.getInstance

afterEach(() => {
	RedisClient.getInstance = realGetInstance
})

/** Redis tiruan secukupnya untuk `multi().incr().pexpire().exec()`. */
function fakeRedis(behaviour: 'ok' | 'hang' | 'fail' = 'ok') {
	const counts = new Map<string, number>()
	RedisClient.getInstance = (() => ({
		multi() {
			let key = ''
			const chain = {
				incr(k: string) {
					key = k
					return chain
				},
				pexpire() {
					return chain
				},
				exec() {
					if (behaviour === 'hang') return new Promise(() => {})
					if (behaviour === 'fail') return Promise.reject(new Error('ECONNREFUSED'))
					const next = (counts.get(key) ?? 0) + 1
					counts.set(key, next)
					return Promise.resolve([
						[null, next],
						[null, 1],
					])
				},
			}
			return chain
		},
	})) as unknown as typeof RedisClient.getInstance
	return counts
}

function app(limit: number, userId: string | null = 'penulis-1') {
	const server = new Hono<AppEnv>()
	server.use('*', async (c, next) => {
		if (userId) {
			c.set('userId', userId)
			c.set('identityOrigin', 'ppe')
		}
		await next()
	})
	server.post('/', rateLimit('uji', 'permintaan uji', limit), (c) => c.text('ok'))
	return server
}

const hit = (server: Hono<AppEnv>) => server.request('/', { method: 'POST' })

describe('rateLimit', () => {
	test('permintaan melewati batas dibalas 429 dengan Retry-After dan pesan untuk penulis', async () => {
		fakeRedis()
		const server = app(2)

		expect((await hit(server)).status).toBe(200)
		expect((await hit(server)).status).toBe(200)
		const limited = await hit(server)

		expect(limited.status).toBe(429)
		const retryAfter = Number(limited.headers.get('retry-after'))
		expect(retryAfter).toBeGreaterThanOrEqual(1)
		expect(retryAfter).toBeLessThanOrEqual(60)
		const body = (await limited.json()) as { errors: string[] }
		expect(body.errors[0]).toContain('Batas 2 permintaan uji per menit')
	})

	test('setiap pengguna punya embernya sendiri', async () => {
		fakeRedis()
		const first = app(1, 'penulis-1')
		const second = app(1, 'penulis-2')

		expect((await hit(first)).status).toBe(200)
		expect((await hit(second)).status).toBe(200)
		expect((await hit(first)).status).toBe(429)
	})

	test('batas 0 mematikannya, dan permintaan tanpa identitas tidak dihitung', async () => {
		const counts = fakeRedis()

		for (let i = 0; i < 3; i++) expect((await hit(app(0))).status).toBe(200)
		for (let i = 0; i < 3; i++) expect((await hit(app(1, null))).status).toBe(200)
		expect(counts.size).toBe(0)
	})

	test('Redis yang menggantung atau gagal tidak menjatuhkan fiturnya', async () => {
		fakeRedis('hang')
		const started = performance.now()
		expect((await hit(app(1))).status).toBe(200)
		expect(performance.now() - started).toBeLessThan(1_000)

		fakeRedis('fail')
		expect((await hit(app(1))).status).toBe(200)
	})
})
