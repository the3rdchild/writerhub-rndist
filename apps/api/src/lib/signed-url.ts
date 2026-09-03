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

function digest(assetId: string, expiresAt: number): string {
	return createHmac('sha256', secret()).update(`${assetId}.${expiresAt}`).digest('base64url')
}

export interface AssetSignature {
	exp: number
	sig: string
}

export function signAsset(assetId: string, ttlSeconds = env.ASSET_URL_TTL_SECONDS): AssetSignature {
	const exp = Math.floor(Date.now() / 1000) + ttlSeconds
	return { exp, sig: digest(assetId, exp) }
}

/**
 * Memeriksa tanda tangan, dan melempar kalau tidak sah - bukan mengembalikan
 * false. Pemanggilnya adalah handler HTTP, dan satu-satunya jawaban yang benar
 * atas tanda tangan yang salah adalah menolak permintaannya.
 */
export function verifyAsset(assetId: string, exp: number, sig: string): void {
	if (!Number.isFinite(exp) || exp * 1000 < Date.now()) {
		throw AppError.unauthorized('Tautan aset sudah kedaluwarsa')
	}

	const expected = Buffer.from(digest(assetId, exp))
	const given = Buffer.from(sig)
	// timingSafeEqual menuntut panjang yang sama, jadi bedanya diperiksa dulu -
	// dan panjang tanda tangan bukan rahasia.
	if (expected.length !== given.length || !timingSafeEqual(expected, given)) {
		throw AppError.unauthorized('Tanda tangan aset tidak sah')
	}
}
