/**
 * Konsumsi stream job sebagai Promise.
 *
 * Menggantikan pola callback + cleanup manual di versi lama: pemanggil cukup
 * `await`, dan event antara (checkpoint) dikirim lewat `onEvent`. Stream selalu
 * ditutup — baik saat selesai, error, timeout, maupun dibatalkan.
 */

export interface StreamOptions<TEvent> {
	/** Dipanggil untuk setiap event; kembalikan true kalau event itu event terakhir. */
	isTerminal: (event: TEvent) => boolean
	onEvent?: (event: TEvent) => void
	timeoutMs?: number
	signal?: AbortSignal
}

export class StreamError extends Error {}
export class StreamTimeoutError extends StreamError {
	constructor() {
		super('Timeout menunggu hasil, coba lagi')
	}
}

export function streamJob<TEvent>(
	jobId: string,
	{ isTerminal, onEvent, timeoutMs = 120_000, signal }: StreamOptions<TEvent>,
): Promise<TEvent> {
	return new Promise<TEvent>((resolve, reject) => {
		const source = new EventSource(`/api/stream/${encodeURIComponent(jobId)}`)
		let settled = false

		const close = () => {
			settled = true
			clearTimeout(timer)
			source.close()
			signal?.removeEventListener('abort', onAbort)
		}

		const succeed = (event: TEvent) => {
			if (settled) return
			close()
			resolve(event)
		}

		const fail = (error: Error) => {
			if (settled) return
			close()
			reject(error)
		}

		function onAbort() {
			fail(new StreamError('Dibatalkan'))
		}

		const timer = setTimeout(() => fail(new StreamTimeoutError()), timeoutMs)
		signal?.addEventListener('abort', onAbort)

		source.onmessage = (message) => {
			let event: TEvent
			try {
				event = JSON.parse(message.data) as TEvent
			} catch {
				return // heartbeat atau frame rusak — abaikan
			}

			onEvent?.(event)
			if (isTerminal(event)) succeed(event)
		}

		// EventSource juga memicu onerror saat server menutup koneksi secara normal
		// sesudah event terakhir, jadi error hanya berarti kalau belum settled.
		source.onerror = () => fail(new StreamError('Koneksi ke server terputus'))
	})
}
