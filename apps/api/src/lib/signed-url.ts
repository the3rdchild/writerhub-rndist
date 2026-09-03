import { createHmac, timingSafeEqual } from 'node:crypto'
import { env } from '@/config/env'
import { AppError } from '@/lib/error'

/**
 * Tanda tangan untuk URL aset.
 *
 * Bingkai blok HTML punya asal yang unik, jadi permintaannya cross-site dan
 * cookie sesi tidak pernah ikut terkirim. Otorisasi karena itu tidak bisa
 * bersandar pada sesi; yang tersisa adalah URL yang membawa izinnya sendiri -
 * ditandatangani server setelah izinnya diperiksa, dan berumur pendek.
 *
 * Batasnya harus dinyatakan terang-terangan: **URL bertanda tangan adalah
 * capability URL.** Siapa pun yang memegangnya bisa memakainya sampai ia
 * kedaluwarsa. Itu melekat pada desainnya, bukan cacat yang bisa ditambal.
 * Untuk aset yang tidak boleh bocor walau sesaat, satu-satunya jawaban adalah
 * menyisipkannya sebagai `data:` URI lewat kanal yang sudah terautentikasi.
 */

function secret(): string {
	if (!env.ASSET_URL_SECRET) {
		throw AppError.internalServerError('ASSET_URL_SECRET belum diatur; URL aset tidak bisa ditandatangani')
	}
	return env.ASSET_URL_SECRET
}

/**
 * Apa yang diizinkan tanda tangan ini, dan ia **ikut ditandatangani**.
 *
 * Tanpa cakupan di dalam pesannya, tanda tangan untuk satu id berlaku di mana
 * pun id itu diterima. Dokumen dan aset punya ruang UUID yang terpisah hari
 * ini, tapi bergantung pada keterpisahan itu berarti bertaruh bahwa tidak akan
 * pernah ada endpoint ketiga yang menerima id yang sama - taruhan yang tidak
 * perlu diambil ketika harganya satu kata di dalam pesan HMAC.
 */
export type SignedScope = 'asset' | 'render'

const LABEL: Record<SignedScope, string> = { asset: 'Tautan aset', render: 'Tautan render' }

export interface Signature {
	exp: number
	sig: string
}

export interface Signer {
	sign(scope: SignedScope, id: string, ttlSeconds: number): Signature
	verify(scope: SignedScope, id: string, exp: number, sig: string): void
}

/**
 * Penanda tangan atas satu kunci.
 *
 * Terpisah dari kunci penyebarannya supaya logikanya bisa diuji sungguhan.
 * Versi sebelumnya membaca `env` langsung, sehingga uji tanda tangan hanya bisa
 * melewati dirinya sendiri ketika rahasianya belum diatur - dan uji keamanan
 * yang melewati dirinya sendiri hijau selamanya tanpa menguji apa pun.
 */
export function createSigner(key: string): Signer {
	const digest = (scope: SignedScope, id: string, expiresAt: number): string =>
		createHmac('sha256', key).update(`${scope}.${id}.${expiresAt}`).digest('base64url')

	return {
		sign(scope, id, ttlSeconds) {
			const exp = Math.floor(Date.now() / 1000) + ttlSeconds
			return { exp, sig: digest(scope, id, exp) }
		},

		/**
		 * Melempar kalau tidak sah - bukan mengembalikan false. Pemanggilnya
		 * handler HTTP, dan satu-satunya jawaban yang benar atas tanda tangan
		 * yang salah adalah menolak permintaannya.
		 */
		verify(scope, id, exp, sig) {
			if (!Number.isFinite(exp) || exp * 1000 < Date.now()) {
				throw AppError.unauthorized(`${LABEL[scope]} sudah kedaluwarsa`)
			}

			const expected = Buffer.from(digest(scope, id, exp))
			const given = Buffer.from(sig)
			// timingSafeEqual menuntut panjang yang sama, jadi bedanya diperiksa
			// dulu - dan panjang tanda tangan bukan rahasia.
			if (expected.length !== given.length || !timingSafeEqual(expected, given)) {
				throw AppError.unauthorized(`${LABEL[scope]} tidak sah`)
			}
		},
	}
}

export function sign(scope: SignedScope, id: string, ttlSeconds: number): Signature {
	return createSigner(secret()).sign(scope, id, ttlSeconds)
}

export function verify(scope: SignedScope, id: string, exp: number, sig: string): void {
	createSigner(secret()).verify(scope, id, exp, sig)
}

export function signAsset(assetId: string, ttlSeconds = env.ASSET_URL_TTL_SECONDS): Signature {
	return sign('asset', assetId, ttlSeconds)
}

export function verifyAsset(assetId: string, exp: number, sig: string): void {
	verify('asset', assetId, exp, sig)
}

export function signRender(documentId: string, ttlSeconds = env.RENDER_TOKEN_TTL_SECONDS): Signature {
	return sign('render', documentId, ttlSeconds)
}

export function verifyRender(documentId: string, exp: number, sig: string): void {
	verify('render', documentId, exp, sig)
}
