import { describe, expect, test } from 'bun:test'
import { CHAT_MODELS, DEFAULT_CHAT_MODEL, findChatModel, isKnownChatModel } from '@writer-hub/shared'

/**
 * Daftar model chat (A8).
 *
 * Yang paling mahal salahnya di sini adalah `isKnownChatModel`: id yang lolos
 * diteruskan apa adanya sebagai `model` ke provider, memakai kunci API pengguna.
 * Daftar inilah satu-satunya yang berdiri di antara klien dan tagihan itu.
 */

describe('registri model chat', () => {
	test('id unik', () => {
		const ids = CHAT_MODELS.map((model) => model.id)
		expect(new Set(ids).size).toBe(ids.length)
	})

	test('pilihan bawaan ada, berid kosong, dan berada di urutan pertama', () => {
		// Id kosong berarti "jangan kirim `model` sama sekali" - jalan kembali ke
		// provider akun, dan satu-satunya pilihan yang selalu sah.
		expect(CHAT_MODELS[0].id).toBe(DEFAULT_CHAT_MODEL)
		expect(DEFAULT_CHAT_MODEL).toBe('')
	})

	test('id di luar daftar ditolak', () => {
		expect(isKnownChatModel('vendor/model-karangan')).toBe(false)
		expect(isKnownChatModel('../../etc/passwd')).toBe(false)
		expect(isKnownChatModel(CHAT_MODELS[1].id)).toBe(true)
	})

	test('setiap model mendukung tool calling', () => {
		// Panel ini mengoperasikan editor lewat alat. Model tanpa tool calling
		// jatuh ke protokol blok teks dan tampak rusak, jadi ia tidak ditawarkan.
		for (const model of CHAT_MODELS) expect(model.tools).toBe(true)
	})

	test('penanda gratis sejalan dengan id-nya', () => {
		for (const model of CHAT_MODELS) {
			expect(model.free ?? false).toBe(model.id.endsWith(':free'))
		}
	})

	test('findChatModel mengembalikan bawaan untuk id kosong', () => {
		expect(findChatModel(DEFAULT_CHAT_MODEL)?.label).toBe('Bawaan')
		expect(findChatModel('tidak-ada')).toBeUndefined()
	})
})
