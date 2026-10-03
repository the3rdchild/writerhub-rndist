import {
	classifyProviderError,
	isTransientProviderError,
	type ProviderErrorCode,
	providerCodeFromStatus,
} from '@writer-hub/shared'

/**
 * Menerjemahkan kegagalan sebuah giliran chat menjadi sebab yang bisa dibaca
 * penulisnya dan diperiksa programnya.
 *
 * Kenapa perlu: aliran chat dulu meneruskan `error.message` apa adanya, dan
 * `DOMException` dari timeout bawaan runtime lolos begitu saja - penulis
 * membaca "The operation timed out." di panel percakapan, kalimat yang tidak
 * memberi tahu apa yang gagal maupun apa yang bisa ia lakukan.
 *
 * Penggolongannya milik bersama dengan jalur draf (`provider-failure.ts`);
 * yang tinggal di sini kalimatnya, karena di sini kegagalan itu berarti
 * "percakapannya berhenti", bukan "naskahnya tidak jadi ditulis".
 */
export interface ChatFailure {
	code: ProviderErrorCode
	/** Kalimat untuk penulis - menyebut apa yang gagal, bukan nama pengecualiannya. */
	message: string
	/** Layak dicoba ulang segera, tanpa penulis mengubah apa pun. */
	retryable: boolean
}

const MESSAGE: Record<ProviderErrorCode, string> = {
	timeout: "The AI provider didn't answer in time. Your conversation is intact.",
	provider_unreachable: "Couldn't reach the AI provider - check your network connection.",
	quota_exceeded: "The AI provider's quota or balance has run out. Try again later or switch models.",
	provider_rejected: 'The AI provider rejected this request.',
	unknown: 'The conversation stopped for an unknown reason.',
}

function failure(code: ProviderErrorCode, message?: string): ChatFailure {
	return {
		code,
		message: message ?? MESSAGE[code],
		retryable: isTransientProviderError(code),
	}
}

/** Balasan galat dari provider, dipetakan menurut kode HTTP-nya. */
export function chatProviderFailure(status: number, detail: string): ChatFailure {
	const code = providerCodeFromStatus(status)

	if (status === 401 || status === 403) {
		return failure(code, 'The AI provider rejected the API key - check AI_API_KEY.')
	}
	if (code === 'quota_exceeded') return failure(code)

	const trimmed = detail.trim().slice(0, 200)
	return failure(code, `The AI provider responded with ${status}.${trimmed ? ` ${trimmed}` : ''}`)
}

/**
 * Galat apa pun menjadi `ChatFailure`. Pesan aslinya sengaja **tidak** ikut
 * untuk sebab yang sudah dikenali: ia ditulis untuk pengembang, dan di panel
 * percakapan ia hanya menutupi kalimat yang berguna.
 */
export function toChatFailure(error: unknown): ChatFailure {
	const code = classifyProviderError(error)
	if (code !== 'unknown') return failure(code)

	const detail = error instanceof Error ? error.message.trim() : ''
	return failure('unknown', detail ? `${MESSAGE.unknown} (${detail.slice(0, 200)})` : undefined)
}
