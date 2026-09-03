import { afterEach, describe, expect, test } from 'bun:test'
import { env } from '@/config/env'
import { DraftFailure } from './failure'
import { generateDraftMarkdown, providerConfig } from './generation'

const realFetch = globalThis.fetch

afterEach(() => {
	globalThis.fetch = realFetch
})

interface Recorded {
	url: string
	headers: Record<string, string>
	body: Record<string, unknown>
}

/** Balasan SSE gaya OpenAI: satu peristiwa per potongan naskah. */
function sse(pieces: string[], status = 200): Response {
	const events = pieces
		.map((content) => `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`)
		.join('')

	return new Response(`${events}data: [DONE]\n\n`, {
		status,
		headers: { 'content-type': 'text/event-stream' },
	})
}

function completion(content: string): Response {
	return new Response(JSON.stringify({ choices: [{ message: { role: 'assistant', content } }] }), {
		status: 200,
		headers: { 'content-type': 'application/json' },
	})
}

/** Balasan diambil berurutan; yang terakhir dipakai ulang untuk panggilan sesudahnya. */
function stubFetch(...responses: Response[]): Recorded[] {
	const calls: Recorded[] = []
	globalThis.fetch = (async (url: string, init: RequestInit) => {
		calls.push({
			url: String(url),
			headers: init.headers as Record<string, string>,
			body: JSON.parse(String(init.body)),
		})
		return responses[Math.min(calls.length - 1, responses.length - 1)]
	}) as unknown as typeof fetch
	return calls
}

const config = { baseUrl: 'https://provider.test/v1/', apiKey: 'kunci', model: 'model-uji' }
const messages = [{ role: 'user', content: 'buatkan sesuatu' }]

const resolved = {
	userId: 'u-1',
	modelId: 'model-paket',
	alias: null,
	isNineRouter: false,
	baseUrl: 'https://paket.test/v1',
	apiKey: 'kunci-paket',
	sdkProvider: 'openai' as const,
	modelRecordId: 7,
}

describe('generateDraftMarkdown', () => {
	test('meminta naskahnya sebagai stream', async () => {
		const calls = stubFetch(sse(['# Judul\n\nisi']))
		await generateDraftMarkdown(config, messages)

		expect(calls[0].url).toBe('https://provider.test/v1/chat/completions')
		expect(calls[0].headers.authorization).toBe('Bearer kunci')
		expect(calls[0].body.model).toBe('model-uji')
		expect(calls[0].body.stream).toBe(true)
		expect(calls[0].body.messages).toEqual(messages)
	})

	test('potongan stream dirakit kembali menjadi satu naskah', async () => {
		stubFetch(sse(['# Judul', '\n\nsatu ', 'kalimat utuh']))

		expect(await generateDraftMarkdown(config, messages)).toBe('# Judul\n\nsatu kalimat utuh')
	})

	test('kemajuan dilaporkan sebagai panjang naskah yang sudah masuk', async () => {
		stubFetch(sse(['abc', 'de', 'f']))
		const reported: number[] = []

		await generateDraftMarkdown(config, messages, (characters) => reported.push(characters))

		expect(reported).toEqual([3, 5, 6])
	})

	test('pagar yang membungkus seluruh jawaban dibuang', async () => {
		stubFetch(sse(['```markdown\n# Judul\n\nisi\n```']))

		expect(await generateDraftMarkdown(config, messages)).toBe('# Judul\n\nisi')
	})

	/*
	 * Regresi yang benar-benar terjadi: model menurut dan membalas dengan tepat
	 * satu pagar ```html, lalu pagarnya dilucuti di sini - sebelum
	 * `markdownToDoc` sempat mengenalinya sebagai rancangan. Yang tersisa HTML
	 * mentah tanpa penanda, dan ia mendarat di kanvas sebagai paragraf demi
	 * paragraf berisi tag.
	 */
	test('pagar html TIDAK dibuang - ia jawabannya, bukan pembungkusnya', async () => {
		const answer = '```html\n<div style="height:100%">Aksi</div>\n```'
		stubFetch(sse([answer]))

		expect(await generateDraftMarkdown(config, messages)).toBe(answer)
	})

	test('pagar di tengah naskah dibiarkan - ia bagian dari dokumen', async () => {
		const markdown = '# Judul\n\n```python\nprint(1)\n```\n\npenutup'
		stubFetch(sse([markdown]))

		expect(await generateDraftMarkdown(config, messages)).toBe(markdown)
	})

	test('provider yang menolak stream dicoba ulang tanpa stream', async () => {
		const calls = stubFetch(new Response('stream tidak didukung', { status: 400 }), completion('# Judul'))

		expect(await generateDraftMarkdown(config, messages)).toBe('# Judul')
		expect(calls).toHaveLength(2)
		expect(calls[1].body.stream).toBeUndefined()
	})

	test('kuota habis punya kodenya sendiri supaya layak dicoba lagi', async () => {
		stubFetch(new Response('rate limited', { status: 429 }))

		const failure = (await generateDraftMarkdown(config, messages).catch((e) => e)) as DraftFailure
		expect(failure).toBeInstanceOf(DraftFailure)
		expect(failure.code).toBe('quota_exceeded')
	})

	test('kredensial ditolak dibedakan dari kegagalan lain', async () => {
		stubFetch(new Response('bad key', { status: 401 }))

		const failure = (await generateDraftMarkdown(config, messages).catch((e) => e)) as DraftFailure
		expect(failure.code).toBe('provider_rejected')
		expect(failure.message).toContain('401')
	})

	test('naskah kosong dianggap gagal, bukan dokumen kosong', async () => {
		stubFetch(sse(['   ']))

		const failure = (await generateDraftMarkdown(config, messages).catch((e) => e)) as DraftFailure
		expect(failure.code).toBe('empty_response')
	})
})

describe('providerConfig', () => {
	test('provider dari paket pengguna didahulukan', () => {
		expect(providerConfig(resolved)).toEqual({
			baseUrl: 'https://paket.test/v1',
			apiKey: 'kunci-paket',
			model: 'model-paket',
		})
	})

	// Nilai cadangannya datang dari env deployment yang menjalankan uji ini,
	// jadi yang dikunci adalah aturannya: env dipakai saat provider tidak
	// membawa kredensial, dan tanpa keduanya hasilnya null - kondisi yang
	// membuat endpoint draf membalas 503, bukan memanggil provider entah ke mana.
	const fallback = env.AI_API_KEY
		? { baseUrl: env.AI_BASE_URL, apiKey: env.AI_API_KEY, model: env.AI_MODEL }
		: null

	test('tanpa provider, nilai env dipakai sebagai cadangan', () => {
		expect(providerConfig(null)).toEqual(fallback)
	})

	// Jatuhnya per-field, persis seperti AI Chat: kredensial boleh datang dari
	// env sementara model tetap yang ditentukan paket pengguna.
	test('provider tanpa kredensial memakai kunci env, modelnya tetap milik paket', () => {
		expect(providerConfig({ ...resolved, baseUrl: null, apiKey: null })).toEqual(
			fallback ? { ...fallback, model: 'model-paket' } : null,
		)
	})
})
