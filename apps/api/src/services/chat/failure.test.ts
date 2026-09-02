import { describe, expect, test } from 'bun:test'
import { chatProviderFailure, toChatFailure } from './failure'

describe('kegagalan giliran chat', () => {
	/*
	 * Penjaga regresi yang persis: `AbortSignal.timeout` melempar `DOMException`
	 * bernama `TimeoutError` yang pesannya "The operation timed out." - kalimat
	 * runtime yang sempat sampai ke panel percakapan penulis karena aliran chat
	 * meneruskan `error.message` apa adanya.
	 */
	test('timeout tidak pernah membocorkan pesan runtime-nya', () => {
		const timeout = new DOMException('The operation timed out.', 'TimeoutError')
		const failure = toChatFailure(timeout)

		expect(failure.code).toBe('timeout')
		expect(failure.message).not.toContain('operation timed out')
		expect(failure.message).toContain('batas waktu')
		expect(failure.retryable).toBe(true)
	})

	test('percakapan yang dibatalkan terbaca sebagai timeout juga', () => {
		expect(toChatFailure(new DOMException('Aborted', 'AbortError')).code).toBe('timeout')
	})

	test('gangguan jaringan layak dicoba lagi', () => {
		const failure = toChatFailure(new Error('fetch failed'))

		expect(failure.code).toBe('provider_unreachable')
		expect(failure.retryable).toBe(true)
	})

	// Mengulang kunci yang ditolak tidak pernah berhasil - ia hanya menunda
	// kabar buruknya, dan penulis tetap harus memperbaiki kredensialnya.
	test('kredensial ditolak tidak layak dicoba lagi', () => {
		const failure = chatProviderFailure(401, 'invalid api key')

		expect(failure.code).toBe('provider_rejected')
		expect(failure.retryable).toBe(false)
		expect(failure.message).toContain('AI_API_KEY')
	})

	test('kuota habis punya sebabnya sendiri, dan tidak diulang segera', () => {
		const failure = chatProviderFailure(429, 'rate limited')

		expect(failure.code).toBe('quota_exceeded')
		expect(failure.retryable).toBe(false)
	})

	test('galat provider lain membawa kode dan potongan detailnya', () => {
		const failure = chatProviderFailure(500, 'upstream exploded')

		expect(failure.code).toBe('provider_rejected')
		expect(failure.message).toContain('500')
		expect(failure.message).toContain('upstream exploded')
	})

	test('sebab tak dikenal tetap menyertakan detail aslinya', () => {
		const failure = toChatFailure(new Error('sesuatu yang aneh'))

		expect(failure.code).toBe('unknown')
		expect(failure.message).toContain('sesuatu yang aneh')
		expect(failure.retryable).toBe(false)
	})

	test('lemparan yang bukan Error tetap tertangani', () => {
		expect(toChatFailure('putus').code).toBe('unknown')
	})
})
