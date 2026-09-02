import type { DraftErrorCode } from '@writer-hub/shared'

/**
 * Menerjemahkan kegagalan penulisan draf menjadi sebab yang bisa ditindaklanjuti.
 *
 * Kenapa ini perlu berkas sendiri: draf ditulis sesudah balasan HTTP dikirim,
 * jadi tidak ada siapa pun yang menerima galatnya secara langsung. Satu-satunya
 * jejak yang tersisa adalah apa yang tercatat di status - dan `TypeError: fetch
 * failed` tidak memberi tahu pemanggil maupun penulisnya apa yang harus
 * dilakukan. Kode di sini yang memutuskan apakah sesuatu layak dicoba lagi.
 */

export class DraftFailure extends Error {
	constructor(
		readonly code: DraftErrorCode,
		message: string,
	) {
		super(message)
		this.name = 'DraftFailure'
	}
}

/** Balasan galat dari provider, dipetakan menurut kode HTTP-nya. */
export function providerFailure(status: number, detail: string): DraftFailure {
	const trimmed = detail.trim().slice(0, 300)
	const suffix = trimmed ? ` ${trimmed}` : ''

	if (status === 429) {
		return new DraftFailure('quota_exceeded', `Kuota provider AI habis (429).${suffix}`)
	}
	if (status === 401 || status === 403) {
		return new DraftFailure(
			'provider_rejected',
			`Kredensial provider AI ditolak (${status}).${suffix}`.trimEnd(),
		)
	}
	return new DraftFailure('provider_rejected', `Provider AI membalas ${status}.${suffix}`.trimEnd())
}

/** Pola galat jaringan yang muncul sebelum permintaan sempat dijawab. */
const UNREACHABLE = /fetch failed|unable to connect|econnrefused|enotfound|eai_again|network|dns/i

/**
 * Galat apa pun menjadi `DraftFailure`. Yang sudah berupa `DraftFailure`
 * dibiarkan - sebabnya sudah diketahui di tempat kejadian, dan menebaknya
 * ulang dari teks pesan hanya akan menurunkan ketelitian.
 */
export function toDraftFailure(error: unknown): DraftFailure {
	if (error instanceof DraftFailure) return error

	if (error instanceof Error) {
		if (error.name === 'TimeoutError' || error.name === 'AbortError') {
			return new DraftFailure('timeout', 'Provider AI tidak selesai menulis dalam batas waktu.')
		}
		if (UNREACHABLE.test(error.message) || UNREACHABLE.test(String(error.cause ?? ''))) {
			return new DraftFailure('provider_unreachable', `Provider AI tidak bisa dihubungi: ${error.message}`)
		}
		return new DraftFailure('unknown', error.message)
	}

	return new DraftFailure('unknown', 'Draf gagal ditulis karena sebab yang tidak dikenali.')
}
