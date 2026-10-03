import { createHmac, timingSafeEqual } from 'node:crypto'
import { COLLAB_ROLES, type CollabRole } from '@writer-hub/shared'
import { isUuid } from '@/constants/patterns'

/**
 * Tiket websocket kolaborasi.
 *
 * Peramban tidak bisa memanggil API dengan tanda tangan server (HMAC
 * `PP_API_KEY` hanya ada di BFF), dan websocket tidak membawa header buatan.
 * Jadi izinnya diperiksa sekali lewat jalur biasa - BFF → `POST
 * /collab/tickets` - lalu dibungkus menjadi tiket bertanda tangan yang
 * dibawa query `ticket`. Seperti URL aset (`lib/signed-url.ts`), tiket adalah
 * capability: siapa pun yang memegangnya bisa membuka sambungan sampai ia
 * kedaluwarsa. Karena itu umurnya pendek dan cakupannya satu tab.
 *
 * Bentuknya `base64url(JSON klaim).base64url(HMAC-SHA256)`. Pesan HMAC diberi
 * awalan cakupan supaya tanda tangan ini tidak pernah sah di tempat lain
 * walau kuncinya kebetulan dipakai ulang.
 */

export interface CollabClaims {
	v: 1
	/** Id tab server - satu-satunya room yang boleh dibuka tiket ini. */
	tab: string
	doc: string
	/** Pemegang akses: id identitas pemilik, atau `share:<id>` untuk tautan berbagi. */
	sub: string
	/** Id pengguna untuk jejak versi (`created_by`); null untuk tamu tautan berbagi. */
	uid: string | null
	name: string
	role: CollabRole
	/**
	 * Akses tautan berbagi saat tiket dibuat (hanya tiket `share:`). Saat
	 * menyambung, peran dan akses ini dibandingkan dengan tautan yang berlaku:
	 * tiket dari sebelum tautan diturunkan atau dibatasi ditolak.
	 */
	acc?: 'anyone' | 'restricted'
	/** Detik epoch. */
	exp: number
}

export type TicketVerdict = { ok: true; claims: CollabClaims } | { ok: false; reason: string }

const SCOPE = 'collab-ticket.v1'

function isClaims(value: unknown): value is CollabClaims {
	if (!value || typeof value !== 'object') return false
	const claims = value as Record<string, unknown>
	return (
		claims.v === 1 &&
		typeof claims.tab === 'string' &&
		isUuid(claims.tab) &&
		typeof claims.doc === 'string' &&
		typeof claims.sub === 'string' &&
		(claims.uid === null || typeof claims.uid === 'string') &&
		typeof claims.name === 'string' &&
		typeof claims.role === 'string' &&
		(COLLAB_ROLES as readonly string[]).includes(claims.role) &&
		(claims.acc === undefined || claims.acc === 'anyone' || claims.acc === 'restricted') &&
		typeof claims.exp === 'number' &&
		Number.isFinite(claims.exp)
	)
}

export interface TicketSigner {
	sign(claims: Omit<CollabClaims, 'v' | 'exp'>, ttlSeconds: number): { ticket: string; exp: number }
	verify(ticket: string | undefined | null, nowMs?: number): TicketVerdict
}

/** Penanda tangan atas satu kunci; terpisah dari `env` supaya logikanya bisa diuji sungguhan. */
export function createTicketSigner(key: string): TicketSigner {
	if (!key) throw new Error('The collab ticket key is empty')
	const mac = (payload: string): string =>
		createHmac('sha256', key).update(`${SCOPE}.${payload}`).digest('base64url')

	return {
		sign(claims, ttlSeconds) {
			const exp = Math.floor(Date.now() / 1000) + ttlSeconds
			const payload = Buffer.from(JSON.stringify({ v: 1, ...claims, exp })).toString('base64url')
			return { ticket: `${payload}.${mac(payload)}`, exp }
		},

		verify(ticket, nowMs = Date.now()) {
			if (!ticket) return { ok: false, reason: 'missing ticket' }
			const dot = ticket.indexOf('.')
			if (dot <= 0 || dot !== ticket.lastIndexOf('.')) return { ok: false, reason: 'malformed ticket' }

			const payload = ticket.slice(0, dot)
			const expected = Buffer.from(mac(payload))
			const given = Buffer.from(ticket.slice(dot + 1))
			// Panjang tanda tangan bukan rahasia; timingSafeEqual menuntutnya sama.
			if (expected.length !== given.length || !timingSafeEqual(expected, given)) {
				return { ok: false, reason: 'bad signature' }
			}

			let claims: unknown
			try {
				claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
			} catch {
				return { ok: false, reason: 'malformed ticket' }
			}
			if (!isClaims(claims)) return { ok: false, reason: 'malformed ticket' }
			if (claims.exp * 1000 < nowMs) return { ok: false, reason: 'ticket expired' }
			return { ok: true, claims }
		},
	}
}
