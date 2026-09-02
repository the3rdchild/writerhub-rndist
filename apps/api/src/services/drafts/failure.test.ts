import { describe, expect, test } from 'bun:test'
import { DraftFailure, providerFailure, toDraftFailure } from './failure'

describe('providerFailure', () => {
	test('429 dibedakan sebagai kuota, bukan penolakan permanen', () => {
		expect(providerFailure(429, 'rate limit').code).toBe('quota_exceeded')
	})

	test('401 dan 403 menunjuk ke kredensial', () => {
		expect(providerFailure(401, '').code).toBe('provider_rejected')
		expect(providerFailure(403, '').message).toContain('ditolak')
	})

	test('galat lain menyebut kode HTTP-nya supaya bisa ditelusuri', () => {
		expect(providerFailure(500, 'boom').message).toContain('500')
	})

	test('keterangan panjang dari provider dipotong', () => {
		expect(providerFailure(500, 'x'.repeat(1_000)).message.length).toBeLessThan(400)
	})
})

describe('toDraftFailure', () => {
	test('sebab yang sudah diketahui tidak ditebak ulang', () => {
		const known = new DraftFailure('empty_response', 'kosong')

		expect(toDraftFailure(known)).toBe(known)
	})

	test('batas waktu dan pembatalan menjadi timeout', () => {
		const timeout = Object.assign(new Error('The operation timed out'), { name: 'TimeoutError' })

		expect(toDraftFailure(timeout).code).toBe('timeout')
	})

	test('kegagalan jaringan dikenali sebagai provider tak terjangkau', () => {
		expect(toDraftFailure(new Error('fetch failed')).code).toBe('provider_unreachable')
		expect(toDraftFailure(new Error('connect ECONNREFUSED 10.0.0.1:443')).code).toBe('provider_unreachable')
	})

	test('sebab jaringan yang tersembunyi di `cause` tetap terbaca', () => {
		const wrapped = new Error('gagal', { cause: new Error('getaddrinfo ENOTFOUND api.provider') })

		expect(toDraftFailure(wrapped).code).toBe('provider_unreachable')
	})

	test('galat lain tetap membawa pesan aslinya', () => {
		const failure = toDraftFailure(new Error('sesuatu yang aneh'))

		expect(failure.code).toBe('unknown')
		expect(failure.message).toBe('sesuatu yang aneh')
	})

	test('lemparan yang bukan Error tetap menghasilkan kegagalan yang bisa dicatat', () => {
		expect(toDraftFailure('nope').code).toBe('unknown')
	})
})
