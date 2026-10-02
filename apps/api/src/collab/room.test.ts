import { afterEach, describe, expect, test } from 'bun:test'
import { randomUUID } from 'node:crypto'
import {
	COLLAB_CLOSE,
	COLLAB_FRAGMENT,
	COLLAB_MESSAGE,
	type CollabRole,
	type CollabStatus,
} from '@writer-hub/shared'
import * as decoding from 'lib0/decoding'
import * as encoding from 'lib0/encoding'
import * as syncProtocol from 'y-protocols/sync'
import * as Y from 'yjs'
import { CollabConnection, type CollabSocket } from './connection'
import {
	type BusMessage,
	decodeBusMessage,
	encodeBusMessage,
	encodeSeed,
	encodeSyncStep1,
	encodeSyncUpdate,
} from './protocol'
import { CollabRoom, type RoomBus, type RoomHost, type RoomSettings, type RoomStore } from './room'
import { snapshotOf, stateVectorCovers, stateVectorsEqual } from './state-vector'
import type { DeriveResult, StoredCollabState } from './store'
import type { CollabClaims } from './ticket'

/*
 * Room diuji tanpa Postgres dan Redis: penyimpanan dan bus di memori dengan
 * aturan yang sama (gerbang semaian = kepala unik, penjaga state vector pada
 * turunan, pesan bus tidak kembali ke pengirimnya). Uji ujung-ke-ujung dengan
 * proses API sungguhan ada di `collab.integration.test.ts`.
 */

const TAB = '0b5b9c1e-3f43-4c4e-9a43-6f0c2d0a7e11'

class MemoryStore implements RoomStore {
	readonly tabs = new Set<string>([TAB])
	readonly heads = new Map<string, { epoch: string; contentSv: Uint8Array | null }>()
	readonly logs = new Map<string, Array<{ id: number; epoch: string; update: Uint8Array }>>()
	private nextId = 1
	readonly content = new Map<string, Record<string, unknown>>()
	seedCalls = 0

	async tabExists(tabId: string) {
		return this.tabs.has(tabId)
	}
	async load(tabId: string): Promise<StoredCollabState | null> {
		const head = this.heads.get(tabId)
		if (!head) return null
		const rows = (this.logs.get(tabId) ?? []).filter((row) => row.epoch === head.epoch)
		return {
			epoch: head.epoch,
			contentSv: head.contentSv,
			updates: rows.map((row) => row.update),
			rowCount: rows.length,
		}
	}
	async append(tabId: string, epoch: string, update: Uint8Array) {
		if (this.heads.get(tabId)?.epoch !== epoch) return 'stale' as const
		const id = this.nextId++
		this.logs.set(tabId, [...(this.logs.get(tabId) ?? []), { id, epoch, update }])
		return id
	}
	async loadUpdate(tabId: string, epoch: string, id: number) {
		return this.logs.get(tabId)?.find((row) => row.id === id && row.epoch === epoch)?.update ?? null
	}
	async seed(tabId: string, epoch: string, update: Uint8Array) {
		this.seedCalls += 1
		if (!this.tabs.has(tabId)) return 'gone' as const
		if (this.heads.has(tabId)) return 'conflict' as const
		this.heads.set(tabId, { epoch, contentSv: null })
		this.logs.set(tabId, [{ id: this.nextId++, epoch, update }])
		return 'seeded' as const
	}
	async writeDerived(
		tabId: string,
		epoch: string,
		content: Record<string, unknown>,
		stateVector: Uint8Array,
	): Promise<DeriveResult> {
		const head = this.heads.get(tabId)
		if (!head || head.epoch !== epoch) return { result: 'stale' }
		if (stateVectorsEqual(head.contentSv, stateVector)) return { result: 'unchanged' }
		if (!stateVectorCovers(stateVector, head.contentSv)) return { result: 'behind' }
		head.contentSv = stateVector
		this.content.set(tabId, content)
		return { result: 'written', documentId: 'doc' }
	}
	async compact(tabId: string, epoch: string) {
		const rows = (this.logs.get(tabId) ?? []).filter((row) => row.epoch === epoch)
		if (rows.length < 2) return 0
		this.logs.set(tabId, [{ id: this.nextId++, epoch, update: snapshotOf(rows.map((row) => row.update)) }])
		return rows.length
	}
	/** Isi tersimpan di log, dibaca seperti room baru memuatnya. */
	text(tabId = TAB): string {
		const head = this.heads.get(tabId)
		const doc = new Y.Doc()
		for (const row of this.logs.get(tabId) ?? [])
			if (row.epoch === head?.epoch) Y.applyUpdate(doc, row.update)
		return fragmentText(doc)
	}
}

/** Pub/sub di memori: pesan dikodekan seperti di Redis dan tidak kembali ke penerbitnya. */
class Hub {
	readonly subscribers = new Map<string, Set<{ bus: MemoryBus; handler: (message: BusMessage) => void }>>()
	readonly locks = new Map<string, string>()
}

class MemoryBus implements RoomBus {
	readonly instanceId = randomUUID()
	constructor(
		private readonly hub: Hub,
		private readonly options: { alwaysGrantLock?: boolean } = {},
	) {}
	async subscribe(tabId: string, handler: (message: BusMessage) => void) {
		const set = this.hub.subscribers.get(tabId) ?? new Set()
		set.add({ bus: this, handler })
		this.hub.subscribers.set(tabId, set)
	}
	async unsubscribe(tabId: string, handler: (message: BusMessage) => void) {
		const set = this.hub.subscribers.get(tabId)
		for (const entry of set ?? []) if (entry.handler === handler) set?.delete(entry)
	}
	async publish(tabId: string, message: Parameters<RoomBus['publish']>[1]) {
		const bytes = encodeBusMessage({ ...message, origin: this.instanceId } as BusMessage)
		setTimeout(() => {
			for (const entry of this.hub.subscribers.get(tabId) ?? []) {
				const decoded = decodeBusMessage(bytes)
				if (decoded && decoded.origin !== entry.bus.instanceId) entry.handler(decoded)
			}
		}, 1)
	}
	async acquireSeedLock(tabId: string, holder: string) {
		if (this.options.alwaysGrantLock) return true
		if (this.hub.locks.has(tabId)) return false
		this.hub.locks.set(tabId, holder)
		return true
	}
	async releaseSeedLock(tabId: string, holder: string) {
		if (this.hub.locks.get(tabId) === holder) this.hub.locks.delete(tabId)
	}
}

const SETTINGS: RoomSettings = {
	flushMs: 5,
	deriveDebounceMs: 10,
	deriveMaxMs: 40,
	seedLockMs: 150,
	electionRetryMs: 20,
	compactEvery: 1000,
	compactOnUnload: 1000,
	maxAwarenessBytes: 64 * 1024,
	busInlineMaxBytes: 256 * 1024,
}

const quiet = { info() {}, warn() {}, error() {}, debug() {} }

function host(bus: RoomBus, store: RoomStore, settings: Partial<RoomSettings> = {}): RoomHost {
	return {
		bus,
		store,
		settings: { ...SETTINGS, ...settings },
		log: quiet,
		roomEmpty() {},
		roomDead() {},
		contentDerived() {},
	}
}

function claims(role: CollabRole): CollabClaims {
	return {
		v: 1,
		tab: TAB,
		doc: 'doc',
		sub: `sub-${role}`,
		uid: `user-${role}`,
		name: role,
		role,
		exp: Date.now() / 1000 + 60,
	}
}

function fragmentText(doc: Y.Doc): string {
	return doc
		.getXmlFragment(COLLAB_FRAGMENT)
		.toArray()
		.map((node) => (node instanceof Y.XmlElement ? node.toArray().join('') : String(node)))
		.join('\n')
}

function paragraphUpdate(text: string): Uint8Array {
	const doc = new Y.Doc()
	const paragraph = new Y.XmlElement('paragraph')
	paragraph.insert(0, [new Y.XmlText(text)])
	doc.getXmlFragment(COLLAB_FRAGMENT).insert(0, [paragraph])
	return Y.encodeStateAsUpdate(doc)
}

const SERVER = Symbol('server')

/** Klien y-websocket tiruan: menjawab sync, mencatat status, menyemai bila diminta. */
class FakeClient {
	readonly doc = new Y.Doc()
	readonly statuses: CollabStatus[] = []
	closed: { code: number; reason: string } | null = null
	readonly conn: CollabConnection

	constructor(
		private readonly room: CollabRoom,
		role: CollabRole,
		private readonly options: { epoch?: string; seedText?: string | null } = {},
	) {
		const socket: CollabSocket = {
			send: (data) => {
				const copy = data.slice()
				setTimeout(() => this.fromServer(copy), 0)
				return data.byteLength
			},
			close: (code = 1000, reason = '') => {
				this.closed = { code, reason }
			},
		}
		this.conn = new CollabConnection(socket, claims(role), options.epoch ?? '')
		this.doc.on('update', (update: Uint8Array, origin: unknown) => {
			if (origin !== SERVER) this.toServer(encodeSyncUpdate(update))
		})
	}

	/** Seperti y-websocket: langkah 1 dikirim saat terbuka, sebelum room selesai dimuat. */
	connect(): this {
		this.conn.inbox.push(encodeSyncStep1(this.doc))
		this.room.attach(this.conn)
		return this
	}

	type(text: string): void {
		const fragment = this.doc.getXmlFragment(COLLAB_FRAGMENT)
		const paragraph = new Y.XmlElement('paragraph')
		paragraph.insert(0, [new Y.XmlText(text)])
		fragment.insert(fragment.length, [paragraph])
	}

	toServer(data: Uint8Array): void {
		setTimeout(() => this.room.receive(this.conn, data), 0)
	}

	private fromServer(data: Uint8Array): void {
		if (this.closed) return
		const decoder = decoding.createDecoder(data)
		const type = decoding.readVarUint(decoder)
		if (type === COLLAB_MESSAGE.status) {
			const status = JSON.parse(decoding.readVarString(decoder)) as CollabStatus
			this.statuses.push(status)
			if (status.state === 'seed' && this.options.seedText != null) {
				this.toServer(encodeSeed(paragraphUpdate(this.options.seedText)))
			}
			return
		}
		if (type === COLLAB_MESSAGE.sync) {
			const encoder = encoding.createEncoder()
			encoding.writeVarUint(encoder, COLLAB_MESSAGE.sync)
			syncProtocol.readSyncMessage(decoder, encoder, this.doc, SERVER)
			if (encoding.length(encoder) > 1) this.toServer(encoding.toUint8Array(encoder))
		}
	}
}

const rooms: CollabRoom[] = []

async function openRoom(bus: RoomBus, store: RoomStore, settings: Partial<RoomSettings> = {}) {
	const room = new CollabRoom(TAB, host(bus, store, settings))
	await room.load()
	rooms.push(room)
	return room
}

function seedStore(store: MemoryStore, text: string): string {
	const epoch = randomUUID()
	store.heads.set(TAB, { epoch, contentSv: null })
	store.logs.set(TAB, [{ id: 0, epoch, update: paragraphUpdate(text) }])
	return epoch
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

afterEach(async () => {
	for (const room of rooms.splice(0)) await room.destroy()
})

describe('room kolaborasi', () => {
	test('dua editor saling menerima suntingan dan konvergen; log mencatat keduanya', async () => {
		const store = new MemoryStore()
		seedStore(store, 'awal')
		const room = await openRoom(new MemoryBus(new Hub()), store)
		const a = new FakeClient(room, 'editor').connect()
		const b = new FakeClient(room, 'editor').connect()
		await sleep(20)
		expect(fragmentText(a.doc)).toBe('awal')
		expect(fragmentText(b.doc)).toBe('awal')

		a.type('dari A')
		b.type('dari B')
		await sleep(40)
		expect(fragmentText(a.doc)).toBe(fragmentText(b.doc))
		expect(fragmentText(a.doc)).toContain('dari A')
		expect(fragmentText(a.doc)).toContain('dari B')
		expect(store.text()).toBe(fragmentText(a.doc))
	})

	test('viewer menerima isi, tetapi suntingannya tidak pernah sampai ke room, klien lain, maupun log', async () => {
		const store = new MemoryStore()
		seedStore(store, 'awal')
		const room = await openRoom(new MemoryBus(new Hub()), store)
		const editor = new FakeClient(room, 'editor').connect()
		const viewer = new FakeClient(room, 'viewer').connect()
		await sleep(20)
		expect(viewer.statuses.at(-1)).toMatchObject({ state: 'ready', readOnly: true, role: 'viewer' })

		viewer.type('SUNTINGAN-VIEWER')
		editor.type('suntingan editor')
		await sleep(40)
		expect(fragmentText(room.doc)).not.toContain('SUNTINGAN-VIEWER')
		expect(fragmentText(editor.doc)).not.toContain('SUNTINGAN-VIEWER')
		expect(store.text()).not.toContain('SUNTINGAN-VIEWER')
		expect(fragmentText(viewer.doc)).toContain('suntingan editor')
		expect(viewer.conn.droppedWrites).toBeGreaterThan(0)
		expect(viewer.closed).toBeNull()
	})

	test('tab belum disemai: tepat satu klien diminta menyemai, yang lain menunggu lalu menerima isinya', async () => {
		const store = new MemoryStore()
		const room = await openRoom(new MemoryBus(new Hub()), store)
		const first = new FakeClient(room, 'editor', { seedText: 'SEMAI-1' }).connect()
		const second = new FakeClient(room, 'editor', { seedText: 'SEMAI-2' }).connect()
		const viewer = new FakeClient(room, 'viewer').connect()
		await sleep(40)

		const asked = [first, second, viewer].filter((client) => client.statuses.some((s) => s.state === 'seed'))
		expect(asked).toHaveLength(1)
		expect(viewer.statuses.some((s) => s.state === 'seed')).toBe(false)
		for (const client of [first, second, viewer]) {
			expect(client.statuses.at(-1)?.state).toBe('ready')
			expect(fragmentText(client.doc)).toBe('SEMAI-1')
		}
		expect(store.heads.size).toBe(1)
		expect(store.logs.get(TAB)).toHaveLength(1)
		expect(room.epoch).toBe(store.heads.get(TAB)?.epoch ?? 'x')
	})

	test('dua instance yang sama-sama meminta semaian: hanya satu isi yang masuk, tidak pernah ganda', async () => {
		const store = new MemoryStore()
		const hub = new Hub()
		// Kunci Redis dianggap gagal melindungi: kedua instance meminta kliennya
		// menyemai. Gerbangnya tinggal baris kepala di penyimpanan.
		const roomA = await openRoom(new MemoryBus(hub, { alwaysGrantLock: true }), store)
		const roomB = await openRoom(new MemoryBus(hub, { alwaysGrantLock: true }), store)
		const a = new FakeClient(roomA, 'editor', { seedText: 'SEMAI-A' }).connect()
		const b = new FakeClient(roomB, 'editor', { seedText: 'SEMAI-B' }).connect()
		await sleep(60)

		expect(store.seedCalls).toBe(2)
		expect(store.heads.size).toBe(1)
		const winner = store.text()
		expect(['SEMAI-A', 'SEMAI-B']).toContain(winner)
		for (const client of [a, b]) {
			expect(fragmentText(client.doc)).toBe(winner)
			expect(client.statuses.at(-1)?.state).toBe('ready')
		}
		expect(roomA.epoch).toBe(roomB.epoch)
	})

	test('penyemai yang diam digantikan klien lain setelah kuncinya habis', async () => {
		const store = new MemoryStore()
		const room = await openRoom(new MemoryBus(new Hub()), store, { seedLockMs: 60 })
		const silent = new FakeClient(room, 'editor', { seedText: null }).connect()
		await sleep(15)
		const helpful = new FakeClient(room, 'editor', { seedText: 'SEMAI-PENGGANTI' }).connect()
		await sleep(150)

		expect(silent.statuses.some((s) => s.state === 'seed')).toBe(true)
		expect(helpful.statuses.some((s) => s.state === 'seed')).toBe(true)
		expect(fragmentText(silent.doc)).toBe('SEMAI-PENGGANTI')
		expect(store.logs.get(TAB)).toHaveLength(1)
	})

	test('salinan lokal dari generasi lain ditolak 4409 beserta epoch yang berlaku', async () => {
		const store = new MemoryStore()
		const epoch = seedStore(store, 'awal')
		const room = await openRoom(new MemoryBus(new Hub()), store)
		const stale = new FakeClient(room, 'editor', { epoch: randomUUID() }).connect()
		const current = new FakeClient(room, 'editor', { epoch }).connect()
		await sleep(20)
		expect(stale.closed).toEqual({ code: COLLAB_CLOSE.epoch, reason: `epoch:${epoch}` })
		expect(current.closed).toBeNull()
		expect(fragmentText(current.doc)).toBe('awal')

		const fresh = new MemoryStore()
		const unseeded = await openRoom(new MemoryBus(new Hub()), fresh)
		const leftover = new FakeClient(unseeded, 'editor', { epoch }).connect()
		await sleep(10)
		expect(leftover.closed).toEqual({ code: COLLAB_CLOSE.epoch, reason: 'epoch:' })
	})

	test('suntingan menyeberang antar-instance lewat bus setelah tercatat', async () => {
		const store = new MemoryStore()
		seedStore(store, 'awal')
		const hub = new Hub()
		const roomA = await openRoom(new MemoryBus(hub), store)
		const roomB = await openRoom(new MemoryBus(hub), store)
		const a = new FakeClient(roomA, 'editor').connect()
		const b = new FakeClient(roomB, 'editor').connect()
		await sleep(20)

		a.type('lewat instance A')
		await sleep(40)
		expect(fragmentText(b.doc)).toContain('lewat instance A')
		b.type('lewat instance B')
		await sleep(40)
		expect(fragmentText(a.doc)).toBe(fragmentText(b.doc))
		expect(store.text()).toBe(fragmentText(a.doc))
	})

	test('pembaruan dan semaian besar menyeberang sebagai rujukan baris log, bukan isinya', async () => {
		const store = new MemoryStore()
		const hub = new Hub()
		const published: string[] = []
		const tiny = { busInlineMaxBytes: 16 }
		const busA = new MemoryBus(hub)
		const original = busA.publish.bind(busA)
		busA.publish = async (tabId, message) => {
			published.push(message.kind)
			return original(tabId, message)
		}
		const roomA = await openRoom(busA, store, tiny)
		const roomB = await openRoom(new MemoryBus(hub), store, tiny)
		const a = new FakeClient(roomA, 'editor', { seedText: 'SEMAI-BESAR' }).connect()
		await sleep(30)
		const b = new FakeClient(roomB, 'editor').connect()
		await sleep(30)
		expect(fragmentText(b.doc)).toBe('SEMAI-BESAR')

		a.type('paragraf yang cukup panjang untuk melewati batas')
		await sleep(40)
		expect(fragmentText(b.doc)).toContain('paragraf yang cukup panjang')
		expect(published).toContain('seeded-ref')
		expect(published).toContain('update-ref')
		expect(published).not.toContain('update')
	})

	test('isi tab diturunkan dari state Yjs, dan turunan yang tertinggal tidak menimpa yang lebih baru', async () => {
		const store = new MemoryStore()
		seedStore(store, 'awal')
		const room = await openRoom(new MemoryBus(new Hub()), store)
		const a = new FakeClient(room, 'editor').connect()
		await sleep(20)
		a.type('kalimat baru')
		await sleep(80)
		expect(JSON.stringify(store.content.get(TAB))).toContain('kalimat baru')

		// Room kedua di "instance" yang terputus dari bus: ia tidak pernah
		// menerima 'kalimat baru', lalu menulis suntingannya sendiri.
		const isolated = await openRoom(new MemoryBus(new Hub()), store)
		Y.applyUpdate(isolated.doc, paragraphUpdate('cabang lama'))
		const before = store.heads.get(TAB)?.contentSv
		await isolated.derive()
		// Ditolak sebagai 'behind', lalu room itu mengejar dari log dan
		// menurunkan ulang dari state yang mencakup keduanya.
		await sleep(80)
		expect(stateVectorCovers(store.heads.get(TAB)?.contentSv ?? new Uint8Array(), before)).toBe(true)
		expect(JSON.stringify(store.content.get(TAB))).toContain('kalimat baru')
	})

	test('reset dari instance lain memutus semua klien dengan 4409', async () => {
		const store = new MemoryStore()
		seedStore(store, 'awal')
		const hub = new Hub()
		const room = await openRoom(new MemoryBus(hub), store)
		const a = new FakeClient(room, 'editor').connect()
		await sleep(20)
		await new MemoryBus(hub).publish(TAB, { kind: 'reset' })
		await sleep(10)
		expect(a.closed?.code).toBe(COLLAB_CLOSE.epoch)
		expect(room.dead).toBe(true)
	})

	test('tulisan ke generasi yang sudah dibuang mematikan room (4409), bukan tercampur', async () => {
		const store = new MemoryStore()
		seedStore(store, 'awal')
		const room = await openRoom(new MemoryBus(new Hub()), store)
		const a = new FakeClient(room, 'editor').connect()
		await sleep(20)
		store.heads.set(TAB, { epoch: randomUUID(), contentSv: null })
		a.type('ke generasi lama')
		await sleep(30)
		expect(a.closed?.code).toBe(COLLAB_CLOSE.epoch)
	})

	test('pembaruan rusak memutus pengirimnya saja', async () => {
		const store = new MemoryStore()
		seedStore(store, 'awal')
		const room = await openRoom(new MemoryBus(new Hub()), store)
		const bad = new FakeClient(room, 'editor').connect()
		const good = new FakeClient(room, 'editor').connect()
		await sleep(20)
		bad.toServer(encodeSyncUpdate(new Uint8Array([1, 2, 3, 250, 251])))
		await sleep(10)
		expect(bad.closed?.code).toBe(COLLAB_CLOSE.badMessage)
		expect(good.closed).toBeNull()
		good.type('masih jalan')
		await sleep(30)
		expect(store.text()).toContain('masih jalan')
	})
})
