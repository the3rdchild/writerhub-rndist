export interface StreamOptions<TEvent> {
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
				return // heartbeat atau frame rusak - abaikan
			}

			onEvent?.(event)
			if (isTerminal(event)) succeed(event)
		}
		source.onerror = () => fail(new StreamError('Koneksi ke server terputus'))
	})
}
