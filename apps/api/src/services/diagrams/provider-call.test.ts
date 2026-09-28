import { describe, expect, test } from 'bun:test'
import { streamCompletion } from './provider-call'

const OPENROUTER = {
	baseUrl: 'https://openrouter.ai/api/v1',
	apiKey: 'k',
	model: 'deepseek/deepseek-v4-flash',
}
const OTHER = { baseUrl: 'https://api.deepinfra.com/v1/openai', apiKey: 'k', model: 'x' }
const LIMITS = { temperature: 0.2, reasoning: false, idleMs: 1_000, totalMs: 2_000 }

const sse = (...pieces: string[]) =>
	pieces.map((piece) => `data: ${JSON.stringify({ choices: [{ delta: { content: piece } }] })}\n\n`).join('')

/** Aliran yang mengirim potongan-potongan ini, masing-masing sesudah jedanya. */
function streamed(chunks: Array<{ after: number; text: string }>, end = true): Response {
	const encoder = new TextEncoder()
	const body = new ReadableStream<Uint8Array>({
		async start(controller) {
			for (const chunk of chunks) {
				await Bun.sleep(chunk.after)
				try {
					controller.enqueue(encoder.encode(chunk.text))
				} catch {
					return
				}
			}
			if (end) controller.close()
		},
	})
	return new Response(body, { headers: { 'content-type': 'text/event-stream' } })
}

function fakeFetch(response: () => Response, seen: { body?: Record<string, unknown> } = {}): typeof fetch {
	return (async (_url: string, init?: RequestInit) => {
		seen.body = JSON.parse(String(init?.body))
		return response()
	}) as unknown as typeof fetch
}

describe('panggilan sub-agent yang dialirkan', () => {
	test('potongan isi dirangkai; penalaran dimatikan di OpenRouter', async () => {
		const seen: { body?: Record<string, unknown> } = {}
		const reply = await streamCompletion(OPENROUTER, [], {
			...LIMITS,
			fetch: fakeFetch(
				() =>
					streamed([
						{ after: 0, text: `: OPENROUTER PROCESSING\n\n${sse('<svg>', '</svg>')}data: [DONE]\n\n` },
					]),
				seen,
			),
		})
		expect(reply).toEqual({ ok: true, content: '<svg></svg>' })
		expect(seen.body?.stream).toBe(true)
		expect(seen.body?.reasoning).toEqual({ enabled: false })
	})

	test('provider lain tidak menerima saklar yang tidak ia kenal', async () => {
		const seen: { body?: Record<string, unknown> } = {}
		await streamCompletion(OTHER, [], {
			...LIMITS,
			fetch: fakeFetch(() => streamed([{ after: 0, text: sse('x') }]), seen),
		})
		expect(seen.body && 'reasoning' in seen.body).toBe(false)
	})

	test('model yang lambat tapi terus mengalir tidak dipotong jeda', async () => {
		const chunks = Array.from({ length: 6 }, (_, index) => ({ after: 60, text: sse(`p${index}`) }))
		const reply = await streamCompletion(OPENROUTER, [], {
			...LIMITS,
			idleMs: 150,
			totalMs: 2_000,
			fetch: fakeFetch(() => streamed(chunks)),
		})
		expect(reply).toEqual({ ok: true, content: 'p0p1p2p3p4p5' })
	})

	test('koneksi yang diam dihentikan sebagai timeout, bukan "tidak ada gambar"', async () => {
		const reply = await streamCompletion(OPENROUTER, [], {
			...LIMITS,
			idleMs: 100,
			fetch: fakeFetch(() =>
				streamed([
					{ after: 0, text: sse('<svg>') },
					{ after: 5_000, text: sse('</svg>') },
				]),
			),
		})
		expect(reply).toEqual({ ok: false, failure: 'timeout', detail: 'no response for 0 s' })
	})

	test('aliran yang tidak pernah selesai dihentikan batas total', async () => {
		const keepAlive = Array.from({ length: 50 }, () => ({ after: 30, text: ': keep-alive\n\n' }))
		const reply = await streamCompletion(OPENROUTER, [], {
			...LIMITS,
			idleMs: 1_000,
			totalMs: 300,
			fetch: fakeFetch(() => streamed(keepAlive, false)),
		})
		expect(reply.ok).toBe(false)
		expect(!reply.ok && reply.failure).toBe('timeout')
	})

	test('ditolak provider, balasan kosong, dan JSON utuh', async () => {
		const rejected = await streamCompletion(OPENROUTER, [], {
			...LIMITS,
			fetch: fakeFetch(() => new Response('{"error":"bad"}', { status: 400 })),
		})
		expect(rejected).toEqual({ ok: false, failure: 'rejected', detail: 'HTTP 400' })

		const empty = await streamCompletion(OPENROUTER, [], {
			...LIMITS,
			fetch: fakeFetch(() => streamed([{ after: 0, text: 'data: [DONE]\n\n' }])),
		})
		expect(empty).toEqual({ ok: false, failure: 'empty', detail: 'empty reply' })

		const whole = await streamCompletion(OPENROUTER, [], {
			...LIMITS,
			fetch: fakeFetch(
				() =>
					new Response(JSON.stringify({ choices: [{ message: { content: '<svg/>' } }] }), {
						headers: { 'content-type': 'application/json' },
					}),
			),
		})
		expect(whole).toEqual({ ok: true, content: '<svg/>' })
	})
})
