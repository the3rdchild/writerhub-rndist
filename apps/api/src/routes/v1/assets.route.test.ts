import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('./assets.route.ts', import.meta.url), 'utf8')

interface Route {
	method: string
	path: string
	authed: boolean
}

function routes(): Route[] {
	const found: Route[] = []
	for (const line of source.split('\n')) {
		const match = /^assets\.(get|post|put|delete)\('([^']+)'/.exec(line.trim())
		if (!match) continue
		found.push({ method: match[1], path: match[2], authed: line.includes('authMiddleware') })
	}
	return found
}

/**
 * Rute yang SENGAJA tanpa sesi, masing-masing dengan izinnya sendiri:
 * dua jalur share link (tokennya yang menjadi izin) dan satu jalur bingkai
 * blok HTML (tanda tangan pada URL-nya).
 */
const INTENTIONALLY_OPEN = new Set(['/shared/:token/urls', '/shared/:token/:id/inline', '/:id/raw'])

describe('rute aset', () => {
	test('ada rutenya untuk dibaca', () => {
		expect(routes().length).toBeGreaterThan(5)
	})

	/*
	 * Bug yang melahirkan tes ini: `POST /urls` dibuat tanpa authMiddleware
	 * supaya bisa melayani sesi DAN pemegang share link lewat satu rute. Tapi
	 * middleware itulah yang mengisi identitas di context - jadi cabang sesinya
	 * tidak pernah punya sesi untuk dibaca, dan permintaan yang sah dibalas
	 * "User tidak dikenal". Gagalnya diam: rutenya ada, jawabannya masuk akal,
	 * dan tidak ada yang menunjuk ke sebabnya.
	 */
	test('setiap rute tanpa authMiddleware memang disengaja', () => {
		const open = routes()
			.filter((route) => !route.authed)
			.map((route) => route.path)

		expect(new Set(open)).toEqual(INTENTIONALLY_OPEN)
	})

	test('jalur bersesi memakai authMiddleware', () => {
		for (const route of routes()) {
			if (INTENTIONALLY_OPEN.has(route.path)) continue
			expect(`${route.path} authed=${route.authed}`).toBe(`${route.path} authed=true`)
		}
	})

	/*
	 * Sesi dan share link dilayani rute yang berbeda, bukan satu rute dengan
	 * medan opsional - lihat catatan di berkas rutenya.
	 */
	test('jalur share link terpisah, bukan medan opsional', () => {
		expect(source).toContain("assets.post('/shared/:token/urls'")
		expect(source).toContain("assets.get('/shared/:token/:id/inline'")
	})
})
