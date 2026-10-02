import { describe, expect, test } from 'bun:test'
import { createTicketSigner } from './ticket'

const TAB = '11111111-2222-4333-8444-555555555555'
const base = {
	tab: TAB,
	doc: '99999999-2222-4333-8444-555555555555',
	sub: 'identity-1',
	uid: 'user-1',
	name: 'Penulis',
	role: 'editor' as const,
}

describe('tiket kolaborasi', () => {
	test('tiket yang baru ditandatangani lolos dan membawa klaimnya utuh', () => {
		const signer = createTicketSigner('rahasia')
		const { ticket, exp } = signer.sign(base, 60)
		const verdict = signer.verify(ticket)
		expect(verdict.ok).toBe(true)
		if (!verdict.ok) return
		expect(verdict.claims).toEqual({ v: 1, ...base, exp })
	})

	test('tiket kedaluwarsa ditolak', () => {
		const signer = createTicketSigner('rahasia')
		const { ticket, exp } = signer.sign(base, 60)
		expect(signer.verify(ticket, exp * 1000 + 1)).toEqual({ ok: false, reason: 'ticket expired' })
	})

	test('kunci lain tidak bisa memalsukan tiket', () => {
		const { ticket } = createTicketSigner('kunci-penyerang').sign(base, 60)
		expect(createTicketSigner('rahasia').verify(ticket)).toEqual({ ok: false, reason: 'bad signature' })
	})

	/*
	 * Bagian klaim tidak boleh bisa diubah tanpa merusak tanda tangan - misalnya
	 * viewer yang mengganti perannya menjadi editor.
	 */
	test('klaim yang diubah (peran dinaikkan) ditolak', () => {
		const signer = createTicketSigner('rahasia')
		const { ticket } = signer.sign({ ...base, role: 'viewer' }, 60)
		const [payload, signature] = ticket.split('.')
		const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
		const forged = `${Buffer.from(JSON.stringify({ ...claims, role: 'editor' })).toString('base64url')}.${signature}`
		expect(signer.verify(forged)).toEqual({ ok: false, reason: 'bad signature' })
	})

	test('tiket kosong atau rusak ditolak tanpa melempar', () => {
		const signer = createTicketSigner('rahasia')
		expect(signer.verify(undefined)).toEqual({ ok: false, reason: 'missing ticket' })
		expect(signer.verify('')).toEqual({ ok: false, reason: 'missing ticket' })
		expect(signer.verify('tanpa-titik')).toEqual({ ok: false, reason: 'malformed ticket' })
		expect(signer.verify('a.b.c')).toEqual({ ok: false, reason: 'malformed ticket' })
		expect(signer.verify('.abc')).toEqual({ ok: false, reason: 'malformed ticket' })
	})

	test('klaim yang bentuknya salah ditolak walau tanda tangannya sah', () => {
		const signer = createTicketSigner('rahasia')
		const { ticket: badRole } = signer.sign({ ...base, role: 'owner' as never }, 60)
		expect(signer.verify(badRole)).toEqual({ ok: false, reason: 'malformed ticket' })
		const { ticket: badTab } = signer.sign({ ...base, tab: 'bukan-uuid' }, 60)
		expect(signer.verify(badTab)).toEqual({ ok: false, reason: 'malformed ticket' })
	})

	test('kunci kosong ditolak saat membuat penanda tangan', () => {
		expect(() => createTicketSigner('')).toThrow()
	})
})
