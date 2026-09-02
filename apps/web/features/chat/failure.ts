import { isTransientProviderError, type ProviderErrorCode } from '@writer-hub/shared'

/**
 * Kegagalan giliran chat sebagaimana dibawa sampai ke antarmuka.
 *
 * Sebelumnya panel percakapan hanya menerima sebuah `Error` dan menampilkan
 * `message`-nya apa adanya - termasuk "The operation timed out." dari timeout
 * bawaan runtime. Sebabnya tidak ikut, jadi antarmuka tidak punya dasar untuk
 * memutuskan apakah giliran itu layak diulang sendiri.
 */
export class ChatTurnError extends Error {
	constructor(
		message: string,
		readonly code: ProviderErrorCode = 'unknown',
		readonly retryable = false,
	) {
		super(message)
		this.name = 'ChatTurnError'
	}
}

/** Apa yang bisa dilakukan penulis - ditampilkan di bawah kalimat galatnya. */
const HINT: Partial<Record<ProviderErrorCode, string>> = {
	timeout: 'Riset dan langkah yang sudah selesai tetap tersimpan.',
	provider_unreachable: 'Periksa koneksi, lalu lanjutkan.',
	quota_exceeded: 'Ganti model di pemilih model, atau tunggu kuotanya pulih.',
	provider_rejected: 'Periksa kunci API dan model yang dipilih.',
}

export function chatFailureHint(code: ProviderErrorCode): string | null {
	return HINT[code] ?? null
}

/**
 * Galat apa pun dari giliran chat menjadi bentuk yang bisa ditampilkan.
 * Yang bukan `ChatTurnError` datang dari jaringan browser, bukan dari provider,
 * jadi ia selalu layak dicoba lagi.
 */
export function toChatTurnError(cause: unknown): ChatTurnError {
	if (cause instanceof ChatTurnError) return cause

	if (cause instanceof Error) {
		const code: ProviderErrorCode = cause.name === 'TimeoutError' ? 'timeout' : 'provider_unreachable'
		return new ChatTurnError(
			code === 'timeout'
				? 'Permintaan tidak selesai dalam batas waktu.'
				: 'Tidak bisa menghubungi layanan percakapan.',
			code,
			isTransientProviderError(code),
		)
	}

	return new ChatTurnError('Percakapan gagal.', 'unknown', false)
}
