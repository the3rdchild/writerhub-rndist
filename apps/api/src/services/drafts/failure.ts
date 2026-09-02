import { classifyProviderError, type DraftErrorCode, providerCodeFromStatus } from '@writer-hub/shared'

/**
 * Menerjemahkan kegagalan penulisan draf menjadi sebab yang bisa ditindaklanjuti.
 *
 * Kenapa ini perlu berkas sendiri: draf ditulis sesudah balasan HTTP dikirim,
 * jadi tidak ada siapa pun yang menerima galatnya secara langsung. Satu-satunya
 * jejak yang tersisa adalah apa yang tercatat di status - dan `TypeError: fetch
 * failed` tidak memberi tahu pemanggil maupun penulisnya apa yang harus
 * dilakukan.
 *
 * Penggolongannya sendiri milik bersama (`provider-failure.ts` di
 * `packages/shared`) - chat memakai yang sama. Yang tinggal di sini hanyalah
 * kalimatnya, karena hanya di jalur inilah kegagalan itu berarti "naskahnya
 * tidak jadi ditulis".
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

	const code = providerCodeFromStatus(status)

	if (code === 'quota_exceeded') {
		return new DraftFailure(code, `Kuota provider AI habis (429).${suffix}`)
	}
	if (status === 401 || status === 403) {
		return new DraftFailure(code, `Kredensial provider AI ditolak (${status}).${suffix}`.trimEnd())
	}
	return new DraftFailure(code, `Provider AI membalas ${status}.${suffix}`.trimEnd())
}

/**
 * Galat apa pun menjadi `DraftFailure`. Yang sudah berupa `DraftFailure`
 * dibiarkan - sebabnya sudah diketahui di tempat kejadian, dan menebaknya
 * ulang dari teks pesan hanya akan menurunkan ketelitian.
 */
export function toDraftFailure(error: unknown): DraftFailure {
	if (error instanceof DraftFailure) return error

	if (error instanceof Error) {
		const code = classifyProviderError(error)

		if (code === 'timeout') {
			return new DraftFailure(code, 'Provider AI tidak selesai menulis dalam batas waktu.')
		}
		if (code === 'provider_unreachable') {
			return new DraftFailure(code, `Provider AI tidak bisa dihubungi: ${error.message}`)
		}
		return new DraftFailure(code, error.message)
	}

	return new DraftFailure('unknown', 'Draf gagal ditulis karena sebab yang tidak dikenali.')
}
