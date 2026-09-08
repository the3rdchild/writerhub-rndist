import { describe, expect, test } from 'bun:test'
import { type WatchableProvider, watchPersistence } from './local-persistence'

function fakeProvider(db?: Promise<unknown>): WatchableProvider & {
	emitSynced: () => void
	destroyed: () => number
	listeners: () => number
} {
	const handlers = new Set<() => void>()
	let destroyCount = 0
	return {
		on: (_event, handler) => {
			handlers.add(handler)
		},
		off: (_event, handler) => {
			handlers.delete(handler)
		},
		destroy: () => {
			destroyCount += 1
		},
		_db: db,
		emitSynced: () => {
			for (const handler of [...handlers]) handler()
		},
		destroyed: () => destroyCount,
		listeners: () => handlers.size,
	}
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 5))

describe('watchPersistence - dokumen harus tetap terbuka walau simpanannya tidak', () => {
	test('simpanan terbaca: jalur siap, provider dibiarkan hidup', async () => {
		const provider = fakeProvider(Promise.resolve({}))
		const seen: string[] = []

		watchPersistence(provider, {
			onReady: () => seen.push('ready'),
			onUnavailable: () => seen.push('unavailable'),
			timeoutMs: 50,
		})
		provider.emitSynced()

		expect(seen).toEqual(['ready'])
		expect(provider.destroyed()).toBe(0)
		/* Penunggunya dilepas begitu terjawab - tidak ada yang menggantung. */
		expect(provider.listeners()).toBe(0)

		await tick()
		expect(seen).toEqual(['ready'])
	})

	test('pembukaan DB ditolak: langsung jalan tanpa simpanan, tidak menunggu tenggat', async () => {
		const provider = fakeProvider(Promise.reject(new Error('storage blocked')))
		const seen: string[] = []

		watchPersistence(provider, {
			onReady: () => seen.push('ready'),
			onUnavailable: () => seen.push('unavailable'),
			/* Tenggatnya jauh: kalau ia yang menyalakan, uji ini gagal. */
			timeoutMs: 10_000,
		})

		await tick()
		expect(seen).toEqual(['unavailable'])
		/* Dimatikan supaya simpanan yang datang terlambat tidak menggandakan isi. */
		expect(provider.destroyed()).toBe(1)
	})

	test('pembukaan yang menggantung: tenggat waktu yang menyelamatkan', async () => {
		const provider = fakeProvider(new Promise(() => {}))
		const seen: string[] = []

		watchPersistence(provider, {
			onReady: () => seen.push('ready'),
			onUnavailable: () => seen.push('unavailable'),
			timeoutMs: 10,
		})

		expect(seen).toEqual([])
		await tick()
		await tick()
		expect(seen).toEqual(['unavailable'])
		expect(provider.destroyed()).toBe(1)
	})

	test('`synced` yang datang terlambat setelah gagal tidak menjalankan apa pun dua kali', async () => {
		const provider = fakeProvider(Promise.reject(new Error('storage blocked')))
		const seen: string[] = []

		watchPersistence(provider, {
			onReady: () => seen.push('ready'),
			onUnavailable: () => seen.push('unavailable'),
			timeoutMs: 10_000,
		})
		await tick()
		provider.emitSynced()

		expect(seen).toEqual(['unavailable'])
	})

	test('pemantauan dihentikan (efek dibersihkan): tidak ada kait yang menyala', async () => {
		const provider = fakeProvider(Promise.reject(new Error('storage blocked')))
		const seen: string[] = []

		const stop = watchPersistence(provider, {
			onReady: () => seen.push('ready'),
			onUnavailable: () => seen.push('unavailable'),
			timeoutMs: 10,
		})
		stop()

		provider.emitSynced()
		await tick()
		await tick()

		expect(seen).toEqual([])
		expect(provider.destroyed()).toBe(0)
	})

	test('tanpa `_db` (versi lain y-indexeddb): tenggat waktunya tetap menangkap', async () => {
		const provider = fakeProvider(undefined)
		const seen: string[] = []

		watchPersistence(provider, {
			onReady: () => seen.push('ready'),
			onUnavailable: () => seen.push('unavailable'),
			timeoutMs: 10,
		})

		await tick()
		await tick()
		expect(seen).toEqual(['unavailable'])
	})
})
