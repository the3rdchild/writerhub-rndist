import { describe, expect, test } from 'bun:test'
import type { ChatStreamEvent } from '@writer-hub/shared'
import { fetchWithDeadline } from './deadline'
import { openChatStream } from './stream'

const encoder = new TextEncoder()
const chunk = (text: string) => `data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\n`

/** Provider palsu: mengirim `pieces` satu per `everyMs`, lalu diam atau selesai. */
function provider(pieces: string[], everyMs: number, then: 'close' | 'hang'): typeof fetch {
	return (async () => {
		let timer: ReturnType<typeof setInterval> | undefined
		const body = new ReadableStream<Uint8Array>({
			start(stream) {
				let sent = 0
				timer = setInterval(() => {
					if (sent < pieces.length) {
						stream.enqueue(encoder.encode(pieces[sent] ?? ''))
						sent += 1
						return
					}
					clearInterval(timer)
					if (then === 'close') stream.close()
				}, everyMs)
			},
			cancel() {
				clearInterval(timer)
			},
		})
		return new Response(body, { headers: { 'content-type': 'text/event-stream' } })
	}) as unknown as typeof fetch
}

/** Provider yang tidak pernah mengirim header, tapi menghormati pembatalan. */
const silent = ((_url: string, init?: RequestInit) =>
	new Promise<Response>((_resolve, reject) => {
		init?.signal?.addEventListener('abort', () => reject(init.signal?.reason), { once: true })
	})) as unknown as typeof fetch

const read = (limits: { idleMs: number; totalMs: number }, fetcher: typeof fetch) =>
	fetchWithDeadline('https://provider.test/v1/chat/completions', {}, limits, fetcher).then((response) =>
		response.text(),
	)

async function collect(stream: ReadableStream<Uint8Array>): Promise<ChatStreamEvent[]> {
	const text = await new Response(stream).text()
	return text
		.split('\n\n')
		.map((line) => line.replace(/^data:\s*/, ''))
		.filter(Boolean)
		.map((payload) => JSON.parse(payload) as ChatStreamEvent)
}

describe('fetchWithDeadline - diam yang diputus, bukan panjang', () => {
	test('aliran yang lebih lama dari batas jeda tetap selesai selama potongannya terus datang', async () => {
		const pieces = Array.from({ length: 8 }, (_, index) => `potongan-${index};`)
		const text = await read({ idleMs: 80, totalMs: 2_000 }, provider(pieces, 30, 'close'))
		expect(text).toBe(pieces.join(''))
	})

	test('aliran yang berhenti mengirim diputus sesudah batas jeda', async () => {
		const started = Date.now()
		const error = await read({ idleMs: 80, totalMs: 2_000 }, provider(['awal;'], 10, 'hang')).catch(
			(caught: unknown) => caught,
		)
		expect((error as Error).name).toBe('TimeoutError')
		expect(Date.now() - started).toBeLessThan(1_000)
	})

	test('batas total tetap berlaku untuk aliran yang tidak pernah selesai', async () => {
		const pieces = Array.from({ length: 100 }, () => ': keep-alive\n\n')
		const error = await read({ idleMs: 80, totalMs: 200 }, provider(pieces, 20, 'close')).catch(
			(caught: unknown) => caught,
		)
		expect((error as Error).name).toBe('TimeoutError')
		expect((error as Error).message).toContain('not finished within')
	})

	test('provider yang tidak mengirim header diputus oleh batas jeda', async () => {
		const error = await read({ idleMs: 50, totalMs: 2_000 }, silent).catch((caught: unknown) => caught)
		expect((error as Error).name).toBe('TimeoutError')
		expect((error as Error).message).toContain('no response for')
	})

	test('penulis yang menutup percakapan tetap menghentikan panggilannya', async () => {
		const closing = new AbortController()
		const pending = fetchWithDeadline(
			'https://provider.test/v1/chat/completions',
			{ signal: closing.signal },
			{ idleMs: 5_000, totalMs: 5_000 },
			silent,
		).catch((caught: unknown) => caught)
		closing.abort()
		expect(((await pending) as Error).name).toBe('AbortError')
	})
})

describe('openChatStream - giliran panjang tidak lagi diputus di tengah', () => {
	test('giliran yang menulis lebih lama dari batas jeda sampai selesai', async () => {
		const pieces = ['Bagian ', 'satu ', 'dan ', 'bagian ', 'dua.'].map(chunk)
		const call = () =>
			fetchWithDeadline(
				'https://provider.test',
				{},
				{ idleMs: 60, totalMs: 2_000 },
				provider(pieces, 25, 'close'),
			)
		const events = await collect(openChatStream(call, false))
		const text = events.flatMap((event) => (event.type === 'delta' ? [event.text] : [])).join('')
		expect(text).toBe('Bagian satu dan bagian dua.')
		expect(events.some((event) => event.type === 'error')).toBe(false)
		expect(events.at(-1)?.type).toBe('done')
	})

	test('provider yang diam di tengah aliran menjadi galat batas waktu yang bisa dicoba ulang', async () => {
		const call = () =>
			fetchWithDeadline(
				'https://provider.test',
				{},
				{ idleMs: 60, totalMs: 2_000 },
				provider([chunk('Awal')], 10, 'hang'),
			)
		const events = await collect(openChatStream(call, false))
		const error = events.find((event) => event.type === 'error')
		expect(error && 'code' in error ? error.code : undefined).toBe('timeout')
		expect(error && 'retryable' in error ? error.retryable : undefined).toBe(true)
	})
})
