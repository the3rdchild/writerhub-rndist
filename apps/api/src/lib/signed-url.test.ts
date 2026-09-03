import { describe, expect, test } from 'bun:test'
import { createSigner } from './signed-url'

const signer = createSigner('kunci-uji')
const ID = '11111111-1111-4111-8111-111111111111'
const OTHER = '22222222-2222-4222-8222-222222222222'

describe('tanda tangan bercakupan', () => {
	test('tanda tangannya sendiri diterima', () => {
		const { exp, sig } = signer.sign('asset', ID, 300)
		expect(() => signer.verify('asset', ID, exp, sig)).not.toThrow()
	})

	/*
	 * Batas yang paling penting di berkas ini. Tanpa cakupan di dalam pesan
	 * HMAC, tanda tangan untuk satu id berlaku di mana pun id itu diterima -
	 * dan token aset berumur menit menjadi token yang membuka isi dokumen.
	 */
	test('token aset tidak berlaku sebagai token render', () => {
		const { exp, sig } = signer.sign('asset', ID, 300)
		expect(() => signer.verify('render', ID, exp, sig)).toThrow()
	})

	test('token render tidak berlaku sebagai token aset', () => {
		const { exp, sig } = signer.sign('render', ID, 300)
		expect(() => signer.verify('asset', ID, exp, sig)).toThrow()
	})

	test('tanda tangan satu id tidak berlaku untuk id lain', () => {
		const { exp, sig } = signer.sign('render', ID, 300)
		expect(() => signer.verify('render', OTHER, exp, sig)).toThrow()
	})

	test('kunci lain tidak bisa memalsukannya', () => {
		const { exp, sig } = createSigner('kunci-lain').sign('render', ID, 300)
		expect(() => signer.verify('render', ID, exp, sig)).toThrow()
	})

	test('kedaluwarsa ditolak', () => {
		const { exp, sig } = signer.sign('render', ID, -10)
		expect(() => signer.verify('render', ID, exp, sig)).toThrow()
	})

	/*
	 * `exp` ikut ditandatangani, jadi memperpanjangnya membatalkan tanda
	 * tangannya - bukan memperpanjang izinnya.
	 */
	test('exp yang dipalsukan membatalkan tanda tangannya', () => {
		const { exp, sig } = signer.sign('render', ID, 300)
		expect(() => signer.verify('render', ID, exp + 3600, sig)).toThrow()
	})

	test('tanda tangan sampah ditolak tanpa meledak', () => {
		const { exp } = signer.sign('render', ID, 300)
		expect(() => signer.verify('render', ID, exp, 'bukan-tanda-tangan')).toThrow()
		expect(() => signer.verify('render', ID, exp, '')).toThrow()
	})
})
