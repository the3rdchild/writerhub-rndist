import { describe, expect, test } from 'bun:test'
import { ChatTurnError, chatFailureHint, toChatTurnError } from './failure'

describe('kegagalan giliran di sisi antarmuka', () => {
	// Sebab yang datang dari server sudah digolongkan di sana; menebaknya ulang
	// dari teks pesan hanya akan menurunkan ketelitian.
	test('ChatTurnError dari server dipertahankan apa adanya', () => {
		const fromServer = new ChatTurnError('Kuota provider AI habis.', 'quota_exceeded', false)

		expect(toChatTurnError(fromServer)).toBe(fromServer)
		expect(toChatTurnError(fromServer).retryable).toBe(false)
	})

	/*
	 * Galat yang lahir di browser - koneksi putus sebelum SSE sempat membawa
	 * apa pun - tidak punya kode dari server, dan memang selalu layak diulang.
	 */
	test('putus di browser dianggap layak dicoba lagi', () => {
		const failure = toChatTurnError(new Error('Failed to fetch'))

		expect(failure.code).toBe('provider_unreachable')
		expect(failure.retryable).toBe(true)
	})

	test('timeout di browser dikenali dari namanya', () => {
		const failure = toChatTurnError(new DOMException('The operation timed out.', 'TimeoutError'))

		expect(failure.code).toBe('timeout')
		expect(failure.message).not.toContain('operation timed out')
		expect(failure.retryable).toBe(true)
	})

	test('lemparan yang bukan Error tidak layak diulang', () => {
		expect(toChatTurnError(null).retryable).toBe(false)
	})
})

describe('saran tindakan', () => {
	// Kalimat galat memberi tahu apa yang terjadi; saran memberi tahu apa yang
	// bisa dilakukan penulis.
	test('kuota habis mengarahkan ke pemilih model', () => {
		expect(chatFailureHint('quota_exceeded')).toContain('model')
	})

	test('timeout menenangkan bahwa langkahnya tidak hilang', () => {
		expect(chatFailureHint('timeout')).toContain('tersimpan')
	})

	test('sebab tak dikenal tidak mengarang saran', () => {
		expect(chatFailureHint('unknown')).toBeNull()
	})
})
