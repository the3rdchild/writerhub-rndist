import { describe, expect, test } from 'bun:test'
import { Hono } from 'hono'
import { env } from '@/config/env'
import { contentBodyLimit } from '@/middlewares/content-limit'

const server = new Hono()
server.put('/', contentBodyLimit, async (c) => c.json({ bytes: (await c.req.arrayBuffer()).byteLength }))

describe('contentBodyLimit', () => {
	test('naskah di bawah batas diteruskan utuh', async () => {
		const body = 'a'.repeat(1024 * 1024)
		const res = await server.request('/', { method: 'PUT', body })

		expect(res.status).toBe(200)
		expect(((await res.json()) as { bytes: number }).bytes).toBe(body.length)
	})

	test('naskah di atas batas dibalas 413 dengan pesan untuk penulis', async () => {
		const body = new Uint8Array(env.CONTENT_MAX_MB * 1024 * 1024 + 1)
		const res = await server.request('/', { method: 'PUT', body })

		expect(res.status).toBe(413)
		const payload = (await res.json()) as { errors: string[] }
		expect(payload.errors[0]).toContain(`${env.CONTENT_MAX_MB} MB`)
	})
})
