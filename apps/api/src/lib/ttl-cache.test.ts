import { afterEach, describe, expect, setSystemTime, test } from 'bun:test'
import { TtlCache } from '@/lib/ttl-cache'

afterEach(() => {
	setSystemTime()
})

describe('TtlCache', () => {
	test('entri kedaluwarsa sesudah umurnya lewat', () => {
		setSystemTime(new Date('2026-09-30T00:00:00Z'))
		const cache = new TtlCache<string>({ ttlMs: 1_000, maxEntries: 10 })
		cache.set('a', 'satu')
		expect(cache.get('a')).toBe('satu')

		setSystemTime(new Date('2026-09-30T00:00:01.001Z'))
		expect(cache.get('a')).toBeUndefined()
	})

	test('entri tertua dibuang saat melewati batas jumlah', () => {
		const cache = new TtlCache<number>({ ttlMs: 60_000, maxEntries: 2 })
		cache.set('a', 1)
		cache.set('b', 2)
		cache.set('c', 3)

		expect(cache.get('a')).toBeUndefined()
		expect(cache.get('b')).toBe(2)
		expect(cache.get('c')).toBe(3)
	})

	test('umur 0 tidak menyimpan apa pun', async () => {
		const cache = new TtlCache<number>({ ttlMs: 0, maxEntries: 10 })
		let loads = 0
		await cache.getOrLoad('a', async () => ++loads)
		await cache.getOrLoad('a', async () => ++loads)
		expect(loads).toBe(2)
	})

	test('pemuatan serentak untuk kunci yang sama digabung jadi satu', async () => {
		const cache = new TtlCache<string>({ ttlMs: 60_000, maxEntries: 10 })
		let loads = 0
		const load = async () => {
			loads += 1
			await Bun.sleep(5)
			return 'hasil'
		}

		const results = await Promise.all([
			cache.getOrLoad('a', load),
			cache.getOrLoad('a', load),
			cache.getOrLoad('a', load),
		])

		expect(results).toEqual(['hasil', 'hasil', 'hasil'])
		expect(loads).toBe(1)
		await cache.getOrLoad('a', load)
		expect(loads).toBe(1)
	})

	test('galat diteruskan ke semua penunggu dan tidak disimpan', async () => {
		const cache = new TtlCache<string>({ ttlMs: 60_000, maxEntries: 10 })
		let loads = 0
		const failing = async () => {
			loads += 1
			await Bun.sleep(1)
			throw new Error('hulu mati')
		}

		const settled = await Promise.allSettled([cache.getOrLoad('a', failing), cache.getOrLoad('a', failing)])
		expect(settled.map((result) => result.status)).toEqual(['rejected', 'rejected'])
		expect(loads).toBe(1)

		expect(await cache.getOrLoad('a', async () => 'pulih')).toBe('pulih')
	})

	test('hasil yang ditolak shouldCache tidak disimpan', async () => {
		const cache = new TtlCache<string | null>({ ttlMs: 60_000, maxEntries: 10 })
		let loads = 0
		const load = async () => {
			loads += 1
			return null
		}

		await cache.getOrLoad('a', load, (value) => value !== null)
		await cache.getOrLoad('a', load, (value) => value !== null)
		expect(loads).toBe(2)
	})

	test('entri basi dipakai langsung sementara pembaruannya berjalan di latar', async () => {
		setSystemTime(new Date('2026-09-30T00:00:00Z'))
		const cache = new TtlCache<string>({ ttlMs: 1_000, staleMs: 10_000, maxEntries: 10 })
		await cache.getOrLoad('a', async () => 'lama')

		setSystemTime(new Date('2026-09-30T00:00:02Z'))
		let release = () => {}
		const refreshed = new Promise<void>((resolve) => {
			release = resolve
		})
		let loads = 0
		const slow = async () => {
			loads += 1
			await refreshed
			return 'baru'
		}

		expect(await cache.getOrLoad('a', slow)).toBe('lama')
		expect(await cache.getOrLoad('a', slow)).toBe('lama')
		expect(loads).toBe(1)

		release()
		await Bun.sleep(1)
		expect(cache.get('a')).toBe('baru')
	})

	test('entri yang lewat jendela basi dimuat ulang dan ditunggu', async () => {
		setSystemTime(new Date('2026-09-30T00:00:00Z'))
		const cache = new TtlCache<string>({ ttlMs: 1_000, staleMs: 1_000, maxEntries: 10 })
		await cache.getOrLoad('a', async () => 'lama')

		setSystemTime(new Date('2026-09-30T00:00:03Z'))
		expect(await cache.getOrLoad('a', async () => 'baru')).toBe('baru')
	})

	test('galat pembaruan di latar membuang entri kecuali evictOnError menolak', async () => {
		setSystemTime(new Date('2026-09-30T00:00:00Z'))
		const cache = new TtlCache<string>({
			ttlMs: 1_000,
			staleMs: 10_000,
			maxEntries: 10,
			evictOnError: (error) => (error as Error).message === 'ditolak',
		})
		await cache.getOrLoad('hulu-mati', async () => 'lama')
		await cache.getOrLoad('ditolak', async () => 'lama')

		setSystemTime(new Date('2026-09-30T00:00:02Z'))
		expect(
			await cache.getOrLoad('hulu-mati', async () => {
				throw new Error('hulu mati')
			}),
		).toBe('lama')
		expect(
			await cache.getOrLoad('ditolak', async () => {
				throw new Error('ditolak')
			}),
		).toBe('lama')
		await Bun.sleep(1)

		// Hulu mati: entri lama tetap melayani.
		expect(await cache.getOrLoad('hulu-mati', () => new Promise<string>(() => {}))).toBe('lama')
		// Ditolak: entri dibuang, jadi permintaan berikutnya menunggu jawaban baru.
		expect(await cache.getOrLoad('ditolak', async () => 'baru')).toBe('baru')
	})
})
