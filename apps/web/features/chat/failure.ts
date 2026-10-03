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
	timeout: 'Research and finished steps are kept.',
	provider_unreachable: 'Check your connection, then continue.',
	quota_exceeded: 'Switch models in the model picker, or wait for the quota to renew.',
	provider_rejected: 'Check the API key and the selected model.',
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
			code === 'timeout' ? "The request didn't finish in time." : "Couldn't reach the chat service.",
			code,
			isTransientProviderError(code),
		)
	}

	return new ChatTurnError('The conversation failed.', 'unknown', false)
}
