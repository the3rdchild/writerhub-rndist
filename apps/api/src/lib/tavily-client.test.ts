import { afterEach, describe, expect, test } from 'bun:test'

process.env.NODE_ENV = 'production'
process.env.TAVILY_API_KEY = 'tvly-test'

const { search, extract } = await import('@/lib/tavily-client')

const realFetch = globalThis.fetch

afterEach(() => {
	globalThis.fetch = realFetch
})

interface Recorded {
	url: string
	body: Record<string, unknown>
}

function stubFetch(responses: unknown[], status = 200): Recorded[] {
	const calls: Recorded[] = []
	let at = 0
	globalThis.fetch = (async (url: string, init: RequestInit) => {
		calls.push({ url: String(url), body: JSON.parse(String(init.body)) })
		const payload = responses[Math.min(at, responses.length - 1)]
		at += 1
		return new Response(JSON.stringify(payload), {
			status,
			headers: { 'content-type': 'application/json' },
		})
	}) as unknown as typeof fetch
	return calls
}

const oneHit = {
	results: [
		{
			url: 'https://contoh.id/berita',
			title: '  Kronologi  ',
			content: 'cuplikan',
			score: 0.9,
			published_date: '2026-08-27',
			favicon: 'https://contoh.id/f.ico',
		},
	],
	usage: { credits: 1 },
}

describe('tavily search', () => {
	test('mengirim bahasa sebagai penyaring, bukan sekadar petunjuk', async () => {
		const calls = stubFetch([oneHit])
		await search({ query: 'demo pati', language: 'id' })

		expect(calls[0].body.language).toBe('id')
		expect(calls[0].body.filter_by_language).toBe(true)
	})

	test('tidak mengirim penyaring bahasa saat bahasa tidak disebut', async () => {
		const calls = stubFetch([oneHit])
		await search({ query: 'demo pati' })

		expect(calls[0].body.language).toBeUndefined()
		expect(calls[0].body.filter_by_language).toBeUndefined()
	})

	test('rentang tanggal dikirim apa adanya untuk topik berita', async () => {
		const calls = stubFetch([oneHit])
		await search({
			query: 'dprd pati diduduki',
			topic: 'news',
			startDate: '2026-08-25',
			endDate: '2026-08-28',
		})

		expect(calls[0].body.topic).toBe('news')
		expect(calls[0].body.start_date).toBe('2026-08-25')
		expect(calls[0].body.end_date).toBe('2026-08-28')
	})

	test('tidak pernah meminta konten mentah - itu urusan extract', async () => {
		const calls = stubFetch([oneHit])
		await search({ query: 'apa saja' })

		expect(calls[0].body.include_raw_content).toBe(false)
		expect(calls[0].body.include_answer).toBe(false)
	})

	test('memetakan hasil jadi sumber yang sudah dirapikan', async () => {
		stubFetch([oneHit])
		const result = await search({ query: 'demo pati' })

		expect(result.sources).toHaveLength(1)
		expect(result.sources[0]).toEqual({
			url: 'https://contoh.id/berita',
			title: 'Kronologi',
			snippet: 'cuplikan',
			score: 0.9,
			publishedAt: '2026-08-27',
			favicon: 'https://contoh.id/f.ico',
		})
		expect(result.credits).toBe(1)
	})

	test('hasil nol memicu satu kali ulang dengan advanced, tidak lebih', async () => {
		const calls = stubFetch([{ results: [], usage: { credits: 1 } }, oneHit])
		const result = await search({ query: 'istilah langka' })

		expect(calls).toHaveLength(2)
		expect(calls[0].body.search_depth).toBe('basic')
		expect(calls[1].body.search_depth).toBe('advanced')
		expect(result.sources).toHaveLength(1)
		expect(result.credits).toBe(2)
	})

	test('hasil nol dua kali berhenti di dua panggilan', async () => {
		const calls = stubFetch([{ results: [] }])
		const result = await search({ query: 'tidak ada' })

		expect(calls).toHaveLength(2)
		expect(result.sources).toHaveLength(0)
	})
})

describe('tavily extract', () => {
	test('memotong di 20 URL - batas penyedia', async () => {
		const calls = stubFetch([{ results: [] }])
		const urls = Array.from({ length: 25 }, (_, at) => `https://contoh.id/${at}`)
		await extract(urls)

		expect((calls[0].body.urls as string[]).length).toBe(20)
	})

	test('tidak memanggil penyedia saat daftar URL kosong', async () => {
		const calls = stubFetch([{ results: [] }])
		const result = await extract([])

		expect(calls).toHaveLength(0)
		expect(result.credits).toBe(0)
	})

	test('menghitung kredit per lima ekstraksi saat penyedia tidak melaporkannya', async () => {
		stubFetch([
			{
				results: Array.from({ length: 6 }, (_, at) => ({
					url: `https://contoh.id/${at}`,
					raw_content: 'isi',
				})),
			},
		])
		const result = await extract(['https://contoh.id/0'])

		expect(result.pages).toHaveLength(6)
		expect(result.credits).toBe(2)
	})

	test('halaman gagal dilaporkan, bukan disembunyikan', async () => {
		stubFetch([
			{
				results: [],
				failed_results: [{ url: 'https://contoh.id/x', error: 'timeout' }],
			},
		])
		const result = await extract(['https://contoh.id/x'])

		expect(result.failed).toEqual([{ url: 'https://contoh.id/x', error: 'timeout' }])
	})
})

describe('galat penyedia', () => {
	test('kredensial ditolak jadi 503, bukan 401 yang menyesatkan pengguna', async () => {
		stubFetch([{ detail: 'unauthorized' }], 401)
		expect(search({ query: 'apa saja' })).rejects.toThrow(/ditolak penyedia/)
	})

	test('kuota penyedia habis diteruskan sebagai 429', async () => {
		stubFetch([{ detail: 'rate limited' }], 429)
		expect(extract(['https://contoh.id/x'])).rejects.toThrow(/[Kk]uota/)
	})
})
