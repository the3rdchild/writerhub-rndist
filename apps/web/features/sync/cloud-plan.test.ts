import { describe, expect, test } from 'bun:test'
import { planCloudSave, serverDocumentOf, tabsAwaitingCloud } from './cloud-plan'
import { RetryScheduler, retryDelayMs } from './retry'

const docs = [
	{ id: 'lokal-1', tabOrder: ['t1', 't2', 't3'] },
	{ id: 'lokal-2', tabOrder: ['u1'] },
]

describe('rencana simpan ke cloud (SHL-6)', () => {
	test('tab kedua dari dokumen yang sudah di cloud masuk ke dokumen server yang sama', () => {
		const linkage = { t1: { documentId: 'server-A' } }
		expect(planCloudSave('t2', docs, linkage)).toEqual({ kind: 'add-tab', documentId: 'server-A' })
	})

	test('tab yang sudah tertaut cukup dikirim; dokumen tanpa tab di cloud menjadi dokumen baru', () => {
		const linkage = { t1: { documentId: 'server-A' } }
		expect(planCloudSave('t1', docs, linkage)).toEqual({ kind: 'push' })
		expect(planCloudSave('u1', docs, linkage)).toEqual({ kind: 'create-document' })
		expect(planCloudSave('tak-dikenal', docs, linkage)).toEqual({ kind: 'create-document' })
	})

	test('dokumen server diambil dari tab tertaut pertama menurut urutan tab', () => {
		expect(serverDocumentOf(docs[0], { t3: { documentId: 'B' }, t2: { documentId: 'A' } })).toBe('A')
		expect(serverDocumentOf(docs[1], {})).toBeNull()
	})

	test('tab baru di dokumen cloud menunggu ditautkan; yang sedang dikerjakan dilewati; ada batasnya', () => {
		const linkage = { t2: { documentId: 'server-A' } }
		expect(tabsAwaitingCloud(docs, linkage, new Set())).toEqual([
			{ tabId: 't1', documentId: 'server-A' },
			{ tabId: 't3', documentId: 'server-A' },
		])
		expect(tabsAwaitingCloud(docs, linkage, new Set(['t1']))).toEqual([
			{ tabId: 't3', documentId: 'server-A' },
		])
		expect(tabsAwaitingCloud(docs, linkage, new Set(), 1)).toEqual([{ tabId: 't1', documentId: 'server-A' }])
		expect(tabsAwaitingCloud(docs, {}, new Set())).toEqual([])
	})
})

describe('coba ulang simpanan (SHL-7)', () => {
	test('jeda memanjang lalu berhenti di batas atas', () => {
		expect([0, 1, 2, 3, 10].map((attempt) => retryDelayMs(attempt))).toEqual([2000, 4000, 8000, 16000, 60000])
	})

	test('yang gagal dicoba lagi sendiri, berhenti setelah berhasil', async () => {
		const runs: string[] = []
		let failuresLeft = 2
		const scheduler: RetryScheduler = new RetryScheduler(
			(key) => {
				runs.push(key)
				if (failuresLeft-- > 0) scheduler.schedule(key)
				else scheduler.clear(key)
			},
			{ baseMs: 5, maxMs: 20 },
		)
		scheduler.schedule('tab-1')
		await Bun.sleep(80)
		expect(runs).toEqual(['tab-1', 'tab-1', 'tab-1'])
		expect(scheduler.has('tab-1')).toBe(false)
	})

	test('kembali online: semua yang menunggu dicoba saat itu juga', () => {
		const runs: string[] = []
		const scheduler = new RetryScheduler((key) => runs.push(key), { baseMs: 60_000 })
		scheduler.schedule('a')
		scheduler.schedule('b')
		scheduler.retryAllNow()
		expect(runs).toEqual(['a', 'b'])
		scheduler.dispose()
		expect(scheduler.has('a')).toBe(false)
	})
})
