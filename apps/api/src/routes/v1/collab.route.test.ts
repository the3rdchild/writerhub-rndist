import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('./collab.route.ts', import.meta.url), 'utf8')

function routes(): Array<{ method: string; path: string; authed: boolean }> {
	const found: Array<{ method: string; path: string; authed: boolean }> = []
	for (const line of source.split('\n')) {
		const match = /^collab\.(get|post|put|delete)\('([^']+)'/.exec(line.trim())
		if (!match) continue
		found.push({ method: match[1], path: match[2], authed: line.includes('authMiddleware') })
	}
	return found
}

describe('rute kolaborasi', () => {
	/*
	 * Tiket pemilik WAJIB lewat sesi. Dua rute lain sengaja terbuka dengan
	 * izinnya sendiri: token tautan berbagi, dan tiket bertanda tangan di query
	 * websocket.
	 */
	test('hanya jalur tautan berbagi dan websocket yang tanpa authMiddleware', () => {
		const open = routes()
			.filter((route) => !route.authed)
			.map((route) => route.path)
		expect(new Set(open)).toEqual(new Set(['/shared/:token/tickets', '/ws/:tabId']))
		expect(routes().find((route) => route.path === '/tickets')?.authed).toBe(true)
	})
})
