import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { randomUUID } from 'node:crypto'
import type { JSONContent } from '@tiptap/core'
import { COLLAB_FRAGMENT, type CollabTicket } from '@writer-hub/shared'
import * as Y from 'yjs'
import { buildSchema } from '@/features/sync/serialize'
// Alat uji API (proses API sungguhan) dipakai ulang; berkas uji tidak ikut tsc web.
import { type ApiProcess, apiJson, freePort, startApi, waitFor } from '../../../api/src/collab/test-harness'
import type { CollabLocalStore } from './local-store'
import { seedUpdateFromJSON } from './seed'
import { type CollabPhase, CollabSession } from './session'

/*
 * CollabSession (klien sungguhan, tanpa React) melawan proses API sungguhan.
 * Butuh basis data uji terpisah seperti uji ujung-ke-ujung di apps/api:
 *
 *   COLLAB_IT_DATABASE_URL=postgresql://writer:writer@localhost:5433/writer_hub_kolab \
 *   COLLAB_IT_REDIS_DB=1 bun test features/collab/session.integration.test.ts
 */

const DATABASE_URL = process.env.COLLAB_IT_DATABASE_URL ?? ''
const enabled = DATABASE_URL !== ''
if (!enabled) {
	console.warn(
		'[session.integration] DILEWATI: set COLLAB_IT_DATABASE_URL (basis data uji terpisah) untuk menjalankannya',
	)
}

const schema = buildSchema()
const ENV: Record<string, string> = {
	DATABASE_URL,
	REDIS_HOST: process.env.COLLAB_IT_REDIS_HOST ?? 'localhost',
	REDIS_PORT: process.env.COLLAB_IT_REDIS_PORT ?? '6379',
	REDIS_DB: process.env.COLLAB_IT_REDIS_DB ?? '1',
	COLLAB_REDIS_PREFIX: `collab-web-it-${randomUUID().slice(0, 8)}:`,
	COLLAB_TICKET_SECRET: `web-it-${randomUUID()}`,
	COLLAB_ROOM_IDLE_S: '1',
	COLLAB_DERIVE_DEBOUNCE_MS: '150',
	COLLAB_DERIVE_MAX_MS: '600',
	AUTH_MODE: 'none',
	STORAGE_DRIVER: 'local',
	RESEARCH_ENABLED: 'false',
}

/** Salinan lokal di memori dengan perilaku yang sama dengan versi IndexedDB. */
function memoryStore(): CollabLocalStore & { epochs: Map<string, string> } {
	const epochs = new Map<string, string>()
	const data = new Map<string, Uint8Array[]>()
	return {
		epochs,
		storedEpoch: (tabId) => epochs.get(tabId) ?? null,
		async attach(tabId, epoch, doc) {
			const key = `${tabId}:${epoch}`
			for (const update of data.get(key) ?? []) Y.applyUpdate(doc, update)
			data.set(key, [...(data.get(key) ?? []), Y.encodeStateAsUpdate(doc)])
			const save = (update: Uint8Array) => data.set(key, [...(data.get(key) ?? []), update])
			doc.on('update', save)
			epochs.set(tabId, epoch)
			return () => doc.off('update', save)
		},
		async discard(tabId, epoch) {
			data.delete(`${tabId}:${epoch}`)
			if (epochs.get(tabId) === epoch) epochs.delete(tabId)
		},
	}
}

function textOf(doc: Y.Doc): string {
	return JSON.stringify(doc.getXmlFragment(COLLAB_FRAGMENT).toJSON())
}

function append(doc: Y.Doc, text: string): void {
	const fragment = doc.getXmlFragment(COLLAB_FRAGMENT)
	const paragraph = new Y.XmlElement('paragraph')
	paragraph.insert(0, [new Y.XmlText(text)])
	fragment.insert(fragment.length, [paragraph])
}

describe.skipIf(!enabled)('CollabSession melawan API sungguhan', () => {
	let api: ApiProcess
	const sessions: CollabSession[] = []
	let ticketRequests = 0

	const fetchTicket = (tabId: string) => {
		ticketRequests += 1
		return apiJson<CollabTicket>(api.url, '/api/v1/collab/tickets', {
			method: 'POST',
			body: JSON.stringify({ tabId }),
		})
	}

	/** Penyemai yang dipakai klien sungguhan: naskah server, dibaca dengan skema editor. */
	const seedFromServer = async ({ ticket }: { ticket: CollabTicket }) => {
		const tab = await apiJson<{ content: JSONContent }>(api.url, `/api/v1/tabs/${ticket.tabId}`)
		return seedUpdateFromJSON(tab.content, schema)
	}

	function session(tabId: string, localStore: CollabLocalStore | null = null): CollabSession {
		const created = new CollabSession({
			tabId,
			fetchTicket,
			seed: seedFromServer,
			localStore,
			maxBackoffMs: 300,
		})
		sessions.push(created)
		return created
	}

	async function createTab(text: string): Promise<string> {
		const created = await apiJson<{ tabs: Array<{ id: string }> }>(api.url, '/api/v1/documents', {
			method: 'POST',
			body: JSON.stringify({
				title: `Sesi ${text}`,
				content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] },
			}),
		})
		return created.tabs[0].id
	}

	const synced = (s: CollabSession, timeout = 10_000) =>
		waitFor(() => s.phase === 'synced', `sesi ${s.tabId} tersinkron`, timeout)

	beforeAll(async () => {
		api = await startApi(freePort(), ENV)
	}, 60_000)

	afterAll(async () => {
		for (const created of sessions.splice(0)) created.destroy()
		await api?.stop('SIGTERM')
	}, 30_000)

	test('dua sesi: satu menyemai dari naskah server, keduanya tersinkron dan saling menerima', async () => {
		const tabId = await createTab('NASKAH-SERVER')
		const a = session(tabId)
		const b = session(tabId)
		const phases: CollabPhase[] = []
		a.on('phase', (phase) => phases.push(phase))
		await Promise.all([a.start(), b.start()])
		await Promise.all([synced(a), synced(b)])

		expect(textOf(a.doc)).toContain('NASKAH-SERVER')
		expect(textOf(a.doc)).toBe(textOf(b.doc))
		expect(a.readOnly).toBe(false)
		expect(phases[0]).toBe('connecting')

		append(a.doc, 'dari-sesi-A')
		append(b.doc, 'dari-sesi-B')
		await waitFor(
			() =>
				[a, b].every((s) => textOf(s.doc).includes('dari-sesi-A') && textOf(s.doc).includes('dari-sesi-B')),
			'suntingan saling tiba',
		)
		expect(textOf(a.doc)).toBe(textOf(b.doc))
	}, 30_000)

	test('pulihkan versi: sesi membuang Y.Doc lama, mendapat yang baru, dan menyemai ulang dari isi server', async () => {
		const tabId = await createTab('VERSI-AWAL')
		const versions = await apiJson<Array<{ id: string }>>(api.url, `/api/v1/tabs/${tabId}/versions`)
		const store = memoryStore()
		const a = session(tabId, store)
		await a.start()
		await synced(a)
		append(a.doc, 'akan-hilang')
		await Bun.sleep(400)

		const discarded: string[] = []
		const replaced: Y.Doc[] = []
		a.on('discard', (doc) => discarded.push(textOf(doc)))
		a.on('doc', (doc) => replaced.push(doc))
		const firstEpoch = a.epoch

		await apiJson(api.url, `/api/v1/tabs/${tabId}/versions/${versions[0].id}/restore`, { method: 'POST' })
		await waitFor(
			() => replaced.length === 1 && a.phase === 'synced',
			'sesi berganti Y.Doc dan tersinkron lagi',
		)

		expect(discarded[0]).toContain('akan-hilang')
		expect(a.doc).toBe(replaced[0])
		expect(textOf(a.doc)).toContain('VERSI-AWAL')
		expect(textOf(a.doc)).not.toContain('akan-hilang')
		expect(a.epoch).not.toBe(firstEpoch)
		expect(store.epochs.get(tabId)).toBe(a.epoch ?? 'x')
	}, 30_000)

	test('salinan lokal dari generasi lama dibuang sebelum menyambung', async () => {
		const tabId = await createTab('GENERASI')
		const store = memoryStore()
		const first = session(tabId, store)
		await first.start()
		await synced(first)
		first.destroy()

		// Server di-reset saat "peramban ini" tertutup.
		const versions = await apiJson<Array<{ id: string }>>(api.url, `/api/v1/tabs/${tabId}/versions`)
		await apiJson(api.url, `/api/v1/tabs/${tabId}/versions/${versions[0].id}/restore`, { method: 'POST' })

		const later = session(tabId, store)
		const discarded: string[] = []
		later.on('discard', (_doc, epoch) => discarded.push(epoch))
		await later.start()
		await synced(later)
		expect(discarded).toEqual([first.epoch ?? 'x'])
		expect(textOf(later.doc)).toContain('GENERASI')
		expect(later.epoch).not.toBe(first.epoch)
	}, 30_000)

	test('suntingan luring tersimpan lokal dan sampai ke server setelah API kembali', async () => {
		const port = freePort()
		const own = await startApi(port, ENV)
		const ownTicket = (tabId: string) =>
			apiJson<CollabTicket>(own.url, '/api/v1/collab/tickets', {
				method: 'POST',
				body: JSON.stringify({ tabId }),
			})
		const created = await apiJson<{ tabs: Array<{ id: string }> }>(own.url, '/api/v1/documents', {
			method: 'POST',
			body: JSON.stringify({ title: 'Luring' }),
		})
		const tabId = created.tabs[0].id
		const writer = new CollabSession({
			tabId,
			fetchTicket: ownTicket,
			seed: async () => seedUpdateFromJSON({ type: 'doc', content: [] }, schema),
			localStore: memoryStore(),
			maxBackoffMs: 200,
		})
		sessions.push(writer)
		await writer.start()
		await synced(writer)

		await own.stop('SIGKILL')
		await waitFor(() => writer.phase === 'offline', 'sesi tahu ia luring')
		append(writer.doc, 'ditulis-saat-luring')

		const back = await startApi(port, ENV)
		await waitFor(() => writer.phase === 'synced', 'sesi tersambung lagi', 15_000)
		const reader = new CollabSession({
			tabId,
			fetchTicket: ownTicket,
			seed: async () => null,
			maxBackoffMs: 200,
		})
		sessions.push(reader)
		await reader.start()
		await synced(reader)
		await waitFor(() => textOf(reader.doc).includes('ditulis-saat-luring'), 'suntingan luring tiba')
		await back.stop('SIGTERM')
	}, 60_000)

	test('muat ulang saat luring: salinan lokal langsung bisa disunting, lalu terkirim saat API kembali', async () => {
		const port = freePort()
		let own = await startApi(port, ENV)
		const ownTicket = (tabId: string) =>
			apiJson<CollabTicket>(own.url, '/api/v1/collab/tickets', {
				method: 'POST',
				body: JSON.stringify({ tabId }),
			})
		const created = await apiJson<{ tabs: Array<{ id: string }> }>(own.url, '/api/v1/documents', {
			method: 'POST',
			body: JSON.stringify({ title: 'Muat ulang luring' }),
		})
		const tabId = created.tabs[0].id
		const store = memoryStore()
		const first = new CollabSession({
			tabId,
			fetchTicket: ownTicket,
			seed: async () => seedUpdateFromJSON({ type: 'doc', content: [] }, schema),
			localStore: store,
			assumeRole: 'editor',
			maxBackoffMs: 200,
		})
		sessions.push(first)
		await first.start()
		await synced(first)
		append(first.doc, 'sebelum-muat-ulang')
		await Bun.sleep(300)
		first.destroy()
		await own.stop('SIGKILL')

		// "Muat ulang" tanpa jaringan: sesi baru dengan salinan lokal yang sama.
		const reloaded = new CollabSession({
			tabId,
			fetchTicket: ownTicket,
			seed: async () => null,
			localStore: store,
			assumeRole: 'editor',
			maxBackoffMs: 200,
		})
		sessions.push(reloaded)
		void reloaded.start()
		await waitFor(() => reloaded.contentReady, 'salinan lokal termuat tanpa jaringan')
		expect(textOf(reloaded.doc)).toContain('sebelum-muat-ulang')
		expect(reloaded.readOnly).toBe(false)
		append(reloaded.doc, 'ditulis-setelah-muat-ulang-luring')

		own = await startApi(port, ENV)
		await waitFor(() => reloaded.phase === 'synced', 'tersambung setelah API kembali', 20_000)
		const reader = new CollabSession({
			tabId,
			fetchTicket: ownTicket,
			seed: async () => null,
			maxBackoffMs: 200,
		})
		sessions.push(reader)
		await reader.start()
		await synced(reader)
		await waitFor(() => textOf(reader.doc).includes('ditulis-setelah-muat-ulang-luring'), 'suntingan tiba')
		expect(textOf(reader.doc).split('sebelum-muat-ulang').length - 1).toBe(1)
		await own.stop('SIGTERM')
	}, 60_000)

	test('sambungan yang diputus untuk otorisasi ulang (4401) mengambil tiket baru dan lanjut', async () => {
		const reauth = await startApi(freePort(), { ...ENV, COLLAB_REAUTH_S: '1' })
		const created = await apiJson<{ tabs: Array<{ id: string }> }>(reauth.url, '/api/v1/documents', {
			method: 'POST',
			body: JSON.stringify({ title: 'Reauth' }),
		})
		const tabId = created.tabs[0].id
		let issued = 0
		const writer = new CollabSession({
			tabId,
			fetchTicket: (id) => {
				issued += 1
				return apiJson<CollabTicket>(reauth.url, '/api/v1/collab/tickets', {
					method: 'POST',
					body: JSON.stringify({ tabId: id }),
				})
			},
			seed: async () => seedUpdateFromJSON({ type: 'doc', content: [] }, schema),
			maxBackoffMs: 200,
		})
		sessions.push(writer)
		await writer.start()
		await synced(writer)
		await waitFor(() => issued >= 3, 'tiket diperbarui berulang', 10_000)
		await synced(writer)
		append(writer.doc, 'setelah-reauth')
		const reader = new CollabSession({
			tabId,
			fetchTicket: (id) =>
				apiJson<CollabTicket>(reauth.url, '/api/v1/collab/tickets', {
					method: 'POST',
					body: JSON.stringify({ tabId: id }),
				}),
			seed: async () => null,
			maxBackoffMs: 200,
		})
		sessions.push(reader)
		await reader.start()
		await waitFor(
			() => textOf(reader.doc).includes('setelah-reauth'),
			'suntingan setelah reauth tiba',
			10_000,
		)
		await reauth.stop('SIGTERM')
		expect(ticketRequests).toBeGreaterThan(0)
	}, 60_000)
})
