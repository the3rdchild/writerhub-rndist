import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { randomUUID } from 'node:crypto'
import type { JSONContent } from '@tiptap/core'
import { COLLAB_FRAGMENT, type CollabTicket } from '@writer-hub/shared'
import * as Y from 'yjs'
import type { SharePayload } from '@/features/share/types'
import { buildSchema, jsonToFragment } from '@/features/sync/serialize'
// Alat uji API (proses API sungguhan) dipakai ulang; berkas uji tidak ikut tsc web.
import { type ApiProcess, apiJson, freePort, startApi, waitFor } from '../../../api/src/collab/test-harness'
import type { CollabLocalStore } from './local-store'
import { mirrorFragment } from './mirror'
import { seedUpdateFromFragment, seedUpdateFromJSON } from './seed'
import { type CollabPhase, CollabSession } from './session'
import { seedFromShare } from './share-seed'

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

/**
 * Salinan lokal di memori dengan perilaku yang sama dengan versi IndexedDB.
 * `discardDelayMs` meniru IndexedDB yang lambat membuang salinan basi.
 */
function memoryStore(discardDelayMs = 0): CollabLocalStore & {
	epochs: Map<string, string>
	/** Pembaruan yang ditulis halaman lain ke salinan yang sama (dan belum sampai ke room). */
	inject(tabId: string, epoch: string, update: Uint8Array): void
} {
	const epochs = new Map<string, string>()
	const data = new Map<string, Uint8Array[]>()
	return {
		epochs,
		inject(tabId, epoch, update) {
			const key = `${tabId}:${epoch}`
			data.set(key, [...(data.get(key) ?? []), update])
		},
		async read(tabId, epoch) {
			const updates = data.get(`${tabId}:${epoch}`)
			return updates && updates.length > 0 ? Y.mergeUpdates(updates) : null
		},
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
			if (discardDelayMs > 0) await Bun.sleep(discardDelayMs)
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

	test('cadangan sebelum salinan dibuang memuat juga suntingan luring halaman lain di salinan yang sama', async () => {
		const tabId = await createTab('BERSAMA')
		const versions = await apiJson<Array<{ id: string }>>(api.url, `/api/v1/tabs/${tabId}/versions`)
		const store = memoryStore()
		const a = session(tabId, store)
		await a.start()
		await synced(a)
		const epoch = a.epoch ?? 'x'
		// Tab peramban lain menulis saat luring ke salinan IndexedDB yang sama; belum sampai ke room.
		const otherPage = new Y.Doc()
		Y.applyUpdate(otherPage, Y.encodeStateAsUpdate(a.doc))
		const before = Y.encodeStateVector(otherPage)
		append(otherPage, 'LURING-HALAMAN-LAIN')
		store.inject(tabId, epoch, Y.encodeStateAsUpdate(otherPage, before))

		const discarded: string[] = []
		a.on('discard', (doc) => discarded.push(textOf(doc)))
		await apiJson(api.url, `/api/v1/tabs/${tabId}/versions/${versions[0].id}/restore`, { method: 'POST' })
		await waitFor(() => discarded.length === 1 && a.phase === 'synced', 'salinan dibuang dan tersinkron lagi')
		expect(discarded[0]).toContain('BERSAMA')
		expect(discarded[0]).toContain('LURING-HALAMAN-LAIN')
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

	test('peristiwa offline dari peramban: fase langsung offline, lalu tersambung lagi sendiri', async () => {
		const tabId = await createTab('PERISTIWA-LURING')
		const network = new EventTarget()
		const a = new CollabSession({ tabId, fetchTicket, seed: seedFromServer, maxBackoffMs: 300, network })
		sessions.push(a)
		await a.start()
		await synced(a)

		network.dispatchEvent(new Event('offline'))
		// Seketika - tidak menunggu 30 detik tanpa pesan seperti y-websocket sendiri.
		expect(a.phase).toBe('offline')
		await synced(a)

		append(a.doc, 'setelah-sambung-ulang')
		const b = session(tabId)
		await b.start()
		await synced(b)
		await waitFor(
			() => textOf(b.doc).includes('setelah-sambung-ulang'),
			'suntingan sesudah sambung ulang tiba',
		)
		expect(textOf(b.doc).split('PERISTIWA-LURING').length - 1).toBe(1)

		a.destroy()
		// Sesi yang sudah ditutup tidak lagi bereaksi.
		network.dispatchEvent(new Event('offline'))
		expect(a.phase).toBe('destroyed')
	}, 30_000)

	test('tamu tautan berbagi tidak menimpa versi yang dipulihkan pemilik dengan naskah basi', async () => {
		const tabId = await createTab('VERSI-AWAL')
		const { documentId } = await apiJson<{ documentId: string }>(api.url, `/api/v1/tabs/${tabId}`)
		const versions = await apiJson<Array<{ id: string }>>(api.url, `/api/v1/tabs/${tabId}/versions`)
		const share = await apiJson<{ token: string }>(api.url, '/api/v1/shares', {
			method: 'POST',
			body: JSON.stringify({ documentId, access: 'anyone', role: 'editor' }),
		})
		const serverText = async () =>
			JSON.stringify((await apiJson<{ content: unknown }>(api.url, `/api/v1/tabs/${tabId}`)).content)

		// Pemilik: salinan IndexedDB-nya lambat dibuang, jadi ia kembali ke room belakangan.
		const owner = session(tabId, memoryStore(600))
		await owner.start()
		await synced(owner)
		append(owner.doc, 'TAMBAHAN-PEMILIK')
		await waitFor(async () => (await serverText()).includes('TAMBAHAN-PEMILIK'), 'turunan suntingan pemilik')

		// Penyemai halaman tautan berbagi (tamu tanpa salinan lokal, biasanya tiba lebih dulu).
		const guest = new CollabSession({
			tabId,
			shareToken: share.token,
			fetchTicket: (id, token) =>
				apiJson<CollabTicket>(api.url, `/api/v1/collab/shared/${token}/tickets`, {
					method: 'POST',
					body: JSON.stringify({ tabId: id }),
				}),
			seed: () =>
				seedFromShare({
					shareToken: share.token,
					serverTabId: tabId,
					schema,
					fetchPayload: (token) => apiJson<SharePayload>(api.url, `/api/v1/shares/${token}`),
				}),
			maxBackoffMs: 50,
		})
		sessions.push(guest)
		await guest.start()
		await synced(guest)

		await apiJson(api.url, `/api/v1/tabs/${tabId}/versions/${versions[0].id}/restore`, { method: 'POST' })
		await waitFor(
			() =>
				owner.phase === 'synced' &&
				guest.phase === 'synced' &&
				owner.epoch !== null &&
				owner.epoch === guest.epoch,
			'pemilik dan tamu kembali ke generasi baru',
			15_000,
		)
		await Bun.sleep(400)
		expect(textOf(owner.doc)).toContain('VERSI-AWAL')
		expect(textOf(owner.doc)).not.toContain('TAMBAHAN-PEMILIK')
		expect(textOf(guest.doc)).not.toContain('TAMBAHAN-PEMILIK')
		await waitFor(
			async () => !(await serverText()).includes('TAMBAHAN-PEMILIK'),
			'isi server tetap versi yang dipulihkan',
		)
	}, 40_000)

	test('login habis: suntingan di Y.Doc sesi tetap tersimpan lokal dan terkirim setelah muat ulang', async () => {
		const reauth = await startApi(freePort(), { ...ENV, COLLAB_REAUTH_S: '1' })
		const created = await apiJson<{ tabs: Array<{ id: string }> }>(reauth.url, '/api/v1/documents', {
			method: 'POST',
			body: JSON.stringify({ title: 'Login habis' }),
		})
		const tabId = created.tabs[0].id
		let loggedIn = true
		const ticket = (id: string) =>
			loggedIn
				? apiJson<CollabTicket>(reauth.url, '/api/v1/collab/tickets', {
						method: 'POST',
						body: JSON.stringify({ tabId: id }),
					})
				: Promise.reject(Object.assign(new Error('401'), { status: 401 }))
		const store = memoryStore()
		const writer = new CollabSession({
			tabId,
			fetchTicket: ticket,
			seed: async () => seedUpdateFromJSON({ type: 'doc', content: [] }, schema),
			localStore: store,
			assumeRole: 'editor',
			maxBackoffMs: 200,
		})
		sessions.push(writer)
		await writer.start()
		await synced(writer)

		loggedIn = false
		await waitFor(() => writer.phase === 'denied', 'sesi berhenti karena login habis', 10_000)
		// Editor tetap terikat ke Y.Doc sesi (`bindingOf`, keepWhileInactive): suntingannya masuk ke sini.
		append(writer.doc, 'ditulis-saat-login-habis')
		await Bun.sleep(100)
		writer.destroy()

		// Muat ulang setelah masuk lagi: salinan lokal dimuat dulu, lalu terkirim.
		loggedIn = true
		const reloaded = new CollabSession({
			tabId,
			fetchTicket: ticket,
			seed: async () => null,
			localStore: store,
			assumeRole: 'editor',
			maxBackoffMs: 200,
		})
		sessions.push(reloaded)
		await reloaded.start()
		await synced(reloaded)
		const reader = new CollabSession({
			tabId,
			fetchTicket: ticket,
			seed: async () => null,
			maxBackoffMs: 200,
		})
		sessions.push(reader)
		await reader.start()
		await synced(reader)
		await waitFor(() => textOf(reader.doc).includes('ditulis-saat-login-habis'), 'suntingan tiba di room')
		await reauth.stop('SIGTERM')
	}, 60_000)

	test('tab baru: suntingan salinan lokal sejak semaian dibawa ke sesi lewat diff, tanpa ganda', async () => {
		const tabId = await createTab('AWAL-SALINAN')
		const local = new Y.Doc()
		jsonToFragment(local, 'tab-lokal', {
			type: 'doc',
			content: [{ type: 'paragraph', content: [{ type: 'text', text: 'AWAL-SALINAN' }] }],
		})
		const writer = new CollabSession({
			tabId,
			fetchTicket,
			seed: async () => seedUpdateFromFragment(local.getXmlFragment('tab-lokal')),
			localStore: memoryStore(),
			maxBackoffMs: 300,
		})
		sessions.push(writer)
		await writer.start()
		await synced(writer)

		// Diketik di salinan lokal setelah semaian, sebelum tab diserahkan ke sesinya.
		const paragraph = new Y.XmlElement('paragraph')
		paragraph.insert(0, [new Y.XmlText('SETELAH-SEMAIAN')])
		local.getXmlFragment('tab-lokal').push([paragraph])
		expect(mirrorFragment(local.getXmlFragment('tab-lokal'), writer.doc, COLLAB_FRAGMENT, schema)).toBe(true)

		const reader = session(tabId)
		await reader.start()
		await synced(reader)
		await waitFor(() => textOf(reader.doc).includes('SETELAH-SEMAIAN'), 'suntingan tiba di room')
		expect(textOf(reader.doc).split('AWAL-SALINAN').length - 1).toBe(1)
	}, 30_000)

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

	test('tiket yang terus ditolak (4401) dicoba ulang dengan jeda bertambah, lalu berhenti', async () => {
		const tabId = await createTab('TIKET-DITOLAK')
		let issued = 0
		const rejected = new CollabSession({
			tabId,
			// Tiket yang tidak pernah lolos (misalnya jam server dan klien berselisih jauh).
			fetchTicket: async (id) => {
				issued += 1
				const real = await fetchTicket(id)
				return { ...real, ticket: `${real.ticket}rusak` }
			},
			seed: async () => null,
			maxBackoffMs: 50,
		})
		sessions.push(rejected)
		void rejected.start()
		await Bun.sleep(2_000)
		// Tanpa jeda: puluhan tiket per detik, tanpa akhir.
		expect(issued).toBeLessThanOrEqual(6)
		await waitFor(() => rejected.phase === 'denied', 'sesi berhenti setelah batas penolakan', 30_000)
		const final = issued
		await Bun.sleep(1_000)
		expect(issued).toBe(final)
	}, 45_000)
})
