import { afterEach, describe, expect, test } from 'bun:test'
import { env } from '@/config/env'
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

function stubFetch(payload: unknown, status = 200): Recorded[] {
	const calls: Recorded[] = []
	globalThis.fetch = (async (url: string, init: RequestInit) => {
		calls.push({
			url: String(url),
			headers: init.headers as Record<string, string>,
			body: JSON.parse(String(init.body)),
		})
		return new Response(typeof payload === 'string' ? payload : JSON.stringify(payload), {
			status,
			headers: { 'content-type': 'application/json' },
		})
	}) as unknown as typeof fetch
	return calls
}

function completion(content: string) {
	return { choices: [{ message: { role: 'assistant', content } }] }
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
	test('meminta satu balasan utuh, bukan stream', async () => {
		const calls = stubFetch(completion('# Judul\n\nisi'))
		await generateDraftMarkdown(config, messages)

		expect(calls[0].url).toBe('https://provider.test/v1/chat/completions')
		expect(calls[0].headers.authorization).toBe('Bearer kunci')
		expect(calls[0].body.model).toBe('model-uji')
		expect(calls[0].body.stream).toBeUndefined()
		expect(calls[0].body.messages).toEqual(messages)
	})

	test('mengembalikan naskah apa adanya', async () => {
		stubFetch(completion('# Judul\n\nisi'))

		expect(await generateDraftMarkdown(config, messages)).toBe('# Judul\n\nisi')
	})

	test('pagar yang membungkus seluruh jawaban dibuang', async () => {
		stubFetch(completion('```markdown\n# Judul\n\nisi\n```'))

		expect(await generateDraftMarkdown(config, messages)).toBe('# Judul\n\nisi')
	})

	test('pagar di tengah naskah dibiarkan - ia bagian dari dokumen', async () => {
		const markdown = '# Judul\n\n```python\nprint(1)\n```\n\npenutup'
		stubFetch(completion(markdown))

		expect(await generateDraftMarkdown(config, messages)).toBe(markdown)
	})

	test('balasan galat provider menyebut kodenya', async () => {
		stubFetch({ error: 'nope' }, 429)

		await expect(generateDraftMarkdown(config, messages)).rejects.toThrow('429')
	})

	test('naskah kosong dianggap gagal, bukan dokumen kosong', async () => {
		stubFetch(completion('   '))

		await expect(generateDraftMarkdown(config, messages)).rejects.toThrow('kosong')
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
