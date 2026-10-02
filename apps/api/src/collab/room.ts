import { randomUUID } from 'node:crypto'
import { COLLAB_CLOSE, COLLAB_FRAGMENT, type CollabRoomState, type CollabStatus } from '@writer-hub/shared'
import { type ProseMirrorJSON, yFragmentToProseMirrorJSON } from '@writer-hub/shared/collab-json'
import type { Logger } from 'pino'
import {
	Awareness,
	applyAwarenessUpdate,
	encodeAwarenessUpdate,
	removeAwarenessStates,
} from 'y-protocols/awareness'
import * as Y from 'yjs'
import { CollabConnection } from './connection'
import {
	type BusMessage,
	decodeClientMessage,
	encodeAwareness,
	encodeStatus,
	encodeSyncStep1,
	encodeSyncStep2,
	encodeSyncUpdate,
} from './protocol'
import { stateVectorsEqual } from './state-vector'
import type { DeriveResult, StoredCollabState } from './store'

/*
 * Asal transaksi pada Y.Doc room. Pembaruan dari klien memakai objek
 * sambungannya sendiri sebagai asal, jadi room tahu siapa yang tidak perlu
 * dikirimi gema dan mana yang harus dicatat ke Postgres.
 */
const LOAD_ORIGIN = Symbol('collab:load')
const SEED_ORIGIN = Symbol('collab:seed')
const BUS_ORIGIN = Symbol('collab:bus')
const CATCHUP_ORIGIN = Symbol('collab:catchup')
const CLOSED_ORIGIN = Symbol('collab:closed')

type BusHandler = (message: BusMessage) => void
type OutgoingBusMessage = BusMessage extends infer M
	? M extends BusMessage
		? Omit<M, 'origin'>
		: never
	: never

export interface RoomBus {
	readonly instanceId: string
	subscribe(tabId: string, handler: BusHandler): Promise<void>
	unsubscribe(tabId: string, handler: BusHandler): Promise<void>
	publish(tabId: string, message: OutgoingBusMessage): Promise<void>
	acquireSeedLock(tabId: string, holder: string, ttlMs: number): Promise<boolean>
	releaseSeedLock(tabId: string, holder: string): Promise<void>
}

export interface RoomStore {
	tabExists(tabId: string): Promise<boolean>
	load(tabId: string): Promise<StoredCollabState | null>
	append(tabId: string, epoch: string, update: Uint8Array): Promise<'ok' | 'stale'>
	seed(
		tabId: string,
		epoch: string,
		update: Uint8Array,
		seededBy: string | null,
	): Promise<'seeded' | 'conflict' | 'gone'>
	writeDerived(
		tabId: string,
		epoch: string,
		content: Record<string, unknown>,
		stateVector: Uint8Array,
	): Promise<DeriveResult>
	compact(tabId: string, epoch: string): Promise<number>
}

export interface RoomSettings {
	/** Pembaruan dikumpulkan sekian ms sebelum ditulis sebagai satu baris log. */
	flushMs: number
	deriveDebounceMs: number
	deriveMaxMs: number
	/** Umur kunci penyemaian; penyemai yang diam selama ini digantikan. */
	seedLockMs: number
	electionRetryMs: number
	/** Padatkan log selagi aktif setelah sekian baris baru. */
	compactEvery: number
	/** Padatkan saat room dilepas bila sudah ada sekian baris baru. */
	compactOnUnload: number
	maxAwarenessBytes: number
}

export interface RoomHost {
	readonly bus: RoomBus
	readonly store: RoomStore
	readonly settings: RoomSettings
	readonly log: Pick<Logger, 'info' | 'warn' | 'error' | 'debug'>
	/** Sambungan terakhir lepas. */
	roomEmpty(room: CollabRoom): void
	/** Room tidak bisa dipakai lagi (di-reset, tabnya hilang). */
	roomDead(room: CollabRoom): void
	/** `document_tabs.content` baru saja ditulis dari state Yjs. */
	contentDerived(tabId: string, content: ProseMirrorJSON, editor: string | null): void
}

export class CollabTabGoneError extends Error {
	constructor(tabId: string) {
		super(`Tab ${tabId} tidak ada`)
	}
}

/** Pembaruan awal harus bisa diterapkan berdiri sendiri, tanpa struktur yang menggantung. */
function isSelfContainedUpdate(update: Uint8Array): boolean {
	if (update.byteLength === 0) return false
	const probe = new Y.Doc()
	try {
		Y.applyUpdate(probe, update)
		return probe.store.pendingStructs === null && probe.store.pendingDs === null
	} catch {
		return false
	} finally {
		probe.destroy()
	}
}

/**
 * Satu tab server yang sedang disunting di proses ini: Y.Doc di memori,
 * awareness, sambungan lokal, antrean tulis ke Postgres, dan penurunan
 * `document_tabs.content`.
 */
export class CollabRoom {
	readonly doc = new Y.Doc({ gc: true })
	readonly awareness = new Awareness(this.doc)
	readonly conns = new Set<CollabConnection>()
	/** null = tab belum disemai. */
	epoch: string | null = null
	dead = false

	private loaded = false
	private readonly busBacklog: BusMessage[] = []
	/** State vector dasar `document_tabs.content` yang terakhir diketahui. */
	private contentSv: Uint8Array | null = null

	private pending: Uint8Array[] = []
	private flushTimer: ReturnType<typeof setTimeout> | null = null
	private flushChain: Promise<boolean> = Promise.resolve(true)

	private deriveTimer: ReturnType<typeof setTimeout> | null = null
	private deriveDeadline: ReturnType<typeof setTimeout> | null = null
	private deriveChain: Promise<void> = Promise.resolve()
	private behindStreak = 0
	private lastEditor: string | null = null

	private rowsSinceCompact = 0
	private compacting = false

	private seeder: CollabConnection | null = null
	private seedHolder: string | null = null
	private seedTimer: ReturnType<typeof setTimeout> | null = null
	private electionTimer: ReturnType<typeof setTimeout> | null = null
	private electing = false
	private seeding = false

	private readonly onBus: BusHandler = (message) => this.handleBus(message)

	constructor(
		readonly tabId: string,
		private readonly host: RoomHost,
	) {
		// Server tidak ikut "hadir"; ia hanya meneruskan kehadiran klien.
		this.awareness.setLocalState(null)
		this.doc.on('update', this.onDocUpdate)
		this.awareness.on('update', this.onAwarenessUpdate)
	}

	// ── Siklus hidup ────────────────────────────────────────────────────────

	/**
	 * Berlangganan DULU, baru membaca log. Pembaruan instance lain diterbitkan
	 * setelah tercatat, jadi setiap pembaruan pasti ada di salah satunya: di
	 * log yang terbaca, atau di pesan yang tiba setelah langganan aktif.
	 */
	async load(): Promise<void> {
		await this.host.bus.subscribe(this.tabId, this.onBus)
		if (!(await this.host.store.tabExists(this.tabId))) throw new CollabTabGoneError(this.tabId)

		const state = await this.host.store.load(this.tabId)
		if (state) {
			this.epoch = state.epoch
			this.contentSv = state.contentSv
			this.rowsSinceCompact = state.rowCount
			this.applyAll(state.updates, LOAD_ORIGIN)
			// Penurun sebelumnya mati sebelum sempat menulis isi terbaru.
			if (!stateVectorsEqual(Y.encodeStateVector(this.doc), this.contentSv)) this.scheduleDerive()
		}
		this.loaded = true
		for (const message of this.busBacklog.splice(0)) this.handleBus(message)
		// Klien di instance lain baru akan terlihat setelah pembaruan awareness
		// berikutnya (±15 dtk) - minta sekarang.
		void this.host.bus.publish(this.tabId, { kind: 'query-awareness' })
	}

	/** Simpan semua yang tertunda sebelum room dilepas. */
	async settle(): Promise<void> {
		if (this.dead) return
		await this.flush()
		await this.derive()
		if (this.rowsSinceCompact >= this.host.settings.compactOnUnload) await this.compact()
	}

	async destroy(): Promise<void> {
		this.dead = true
		this.clearTimers()
		this.releaseSeedLock()
		await this.host.bus.unsubscribe(this.tabId, this.onBus).catch(() => {})
		this.awareness.destroy()
		this.doc.destroy()
	}

	/** Room tidak bisa dipakai lagi: putus semua kliennya dengan `code`. */
	kill(code: number, reason: string): void {
		if (this.dead) return
		this.dead = true
		this.clearTimers()
		this.pending = []
		this.releaseSeedLock()
		for (const conn of [...this.conns]) conn.close(code, reason)
		this.conns.clear()
		this.host.roomDead(this)
	}

	private clearTimers(): void {
		for (const timer of [this.flushTimer, this.deriveTimer, this.deriveDeadline, this.electionTimer]) {
			if (timer) clearTimeout(timer)
		}
		this.flushTimer = null
		this.deriveTimer = null
		this.deriveDeadline = null
		this.electionTimer = null
	}

	// ── Sambungan ───────────────────────────────────────────────────────────

	attach(conn: CollabConnection): void {
		if (conn.phase === 'closed') return
		if (this.dead) {
			conn.close(COLLAB_CLOSE.epoch, 'reset')
			return
		}
		conn.room = this
		this.conns.add(conn)

		if (this.epoch) {
			// Salinan dari generasi lain digabung = naskah ganda. Klien membuang
			// salinannya lalu menyambung lagi dengan epoch kosong.
			if (conn.clientEpoch && conn.clientEpoch !== this.epoch) {
				this.reject(conn, COLLAB_CLOSE.epoch, `epoch:${this.epoch}`)
				return
			}
			this.makeReady(conn)
		} else {
			if (conn.clientEpoch) {
				this.reject(conn, COLLAB_CLOSE.epoch, 'epoch:')
				return
			}
			conn.phase = 'waiting'
			conn.send(encodeStatus(this.statusFor(conn, 'waiting')))
			this.sendAwarenessSnapshot(conn)
			this.elect()
		}
		for (const data of conn.inbox.splice(0)) this.receive(conn, data)
	}

	detach(conn: CollabConnection): void {
		if (!this.conns.delete(conn)) return
		if (conn.awarenessClients.size > 0) {
			removeAwarenessStates(this.awareness, [...conn.awarenessClients], CLOSED_ORIGIN)
		}
		if (this.seeder === conn && !this.seeding) this.revokeSeeder(conn, true)
		if (this.conns.size === 0) this.host.roomEmpty(this)
	}

	private reject(conn: CollabConnection, code: number, reason: string): void {
		this.conns.delete(conn)
		conn.close(code, reason)
		if (this.conns.size === 0) this.host.roomEmpty(this)
	}

	private statusFor(conn: CollabConnection, state: CollabRoomState): CollabStatus {
		return { state, epoch: this.epoch, role: conn.claims.role, readOnly: !conn.canWrite }
	}

	private makeReady(conn: CollabConnection): void {
		conn.phase = 'ready'
		conn.send(encodeStatus(this.statusFor(conn, 'ready')))
		// Langkah 1 milik server: klien membalas dengan apa yang belum kita
		// punya (suntingan luring). Dijawab langkah 2 klien yang sudah menunggu.
		conn.send(encodeSyncStep1(this.doc))
		if (conn.pendingStateVector) {
			conn.send(encodeSyncStep2(this.doc, conn.pendingStateVector))
			conn.pendingStateVector = null
		}
		this.sendAwarenessSnapshot(conn)
	}

	private sendAwarenessSnapshot(conn: CollabConnection): void {
		const clients = [...this.awareness.getStates().keys()]
		if (clients.length === 0) return
		conn.send(encodeAwareness(encodeAwarenessUpdate(this.awareness, clients)))
	}

	receive(conn: CollabConnection, data: Uint8Array): void {
		if (conn.phase === 'closed') return
		let message: ReturnType<typeof decodeClientMessage>
		try {
			message = decodeClientMessage(data)
		} catch {
			conn.close(COLLAB_CLOSE.badMessage, 'bad message')
			return
		}

		switch (message.kind) {
			case 'sync-step1':
				if (conn.phase === 'ready') conn.send(encodeSyncStep2(this.doc, message.stateVector))
				else conn.pendingStateVector = message.stateVector
				return
			case 'sync-update':
				// Viewer/commenter, dan siapa pun sebelum tab disemai, hanya
				// menerima. Suntingannya dibuang di sini - tidak pernah sampai ke
				// room, ke log, maupun ke klien lain.
				if (conn.phase !== 'ready' || !conn.canWrite) {
					conn.droppedWrites += 1
					if (conn.droppedWrites === 1) {
						this.host.log.debug(
							{ tabId: this.tabId, role: conn.claims.role, phase: conn.phase },
							'[collab] suntingan dari sambungan tanpa hak tulis dibuang',
						)
					}
					return
				}
				try {
					Y.applyUpdate(this.doc, message.update, conn)
				} catch (error) {
					this.host.log.warn({ err: error, tabId: this.tabId }, '[collab] pembaruan rusak, sambungan diputus')
					conn.close(COLLAB_CLOSE.badMessage, 'bad update')
				}
				return
			case 'awareness':
				if (message.update.byteLength > this.host.settings.maxAwarenessBytes) return
				try {
					applyAwarenessUpdate(this.awareness, message.update, conn)
				} catch {
					conn.close(COLLAB_CLOSE.badMessage, 'bad awareness')
				}
				return
			case 'query-awareness':
				this.sendAwarenessSnapshot(conn)
				return
			case 'seed':
				void this.acceptSeed(conn, message.update)
				return
			default:
				return
		}
	}

	// ── Aliran pembaruan ────────────────────────────────────────────────────

	private readonly onDocUpdate = (update: Uint8Array, origin: unknown): void => {
		// Isi muatan awal dan isi semaian dikirim lewat sync step 2 saat
		// sambungan siap, bukan sebagai pembaruan.
		if (origin === LOAD_ORIGIN || origin === SEED_ORIGIN) return

		const message = encodeSyncUpdate(update)
		for (const conn of this.conns) {
			if (conn !== origin && conn.phase === 'ready') conn.send(message)
		}

		if (origin instanceof CollabConnection) {
			this.pending.push(update)
			this.scheduleFlush(this.host.settings.flushMs)
			if (origin.claims.uid) this.lastEditor = origin.claims.uid
			this.scheduleDerive()
		}
	}

	private readonly onAwarenessUpdate = (
		{ added, updated, removed }: { added: number[]; updated: number[]; removed: number[] },
		origin: unknown,
	): void => {
		const changed = added.concat(updated, removed)
		if (changed.length === 0) return
		if (origin instanceof CollabConnection) {
			for (const client of added) origin.awarenessClients.add(client)
			for (const client of removed) origin.awarenessClients.delete(client)
		}

		const update = encodeAwarenessUpdate(this.awareness, changed)
		// Termasuk pengirimnya: gema ini yang menjaga pengawas "tidak ada pesan
		// 30 dtk" di klien y-websocket tetap tenang selama tab diam.
		const message = encodeAwareness(update)
		for (const conn of this.conns) {
			if (conn.phase === 'waiting' || conn.phase === 'ready') conn.send(message)
		}
		// Hanya perubahan milik sambungan lokal yang diteruskan ke instance lain;
		// kedaluwarsa ('timeout') dihitung sendiri oleh setiap instance.
		if (origin instanceof CollabConnection || origin === CLOSED_ORIGIN) {
			void this.host.bus.publish(this.tabId, { kind: 'awareness', update })
		}
	}

	private applyAll(updates: readonly Uint8Array[], origin: symbol): void {
		Y.transact(
			this.doc,
			() => {
				for (const update of updates) Y.applyUpdate(this.doc, update)
			},
			origin,
		)
	}

	private handleBus(message: BusMessage): void {
		if (this.dead) return
		if (!this.loaded) {
			this.busBacklog.push(message)
			return
		}
		switch (message.kind) {
			case 'update':
				if (message.epoch !== this.epoch) {
					void this.catchUp()
					return
				}
				try {
					Y.applyUpdate(this.doc, message.update, BUS_ORIGIN)
				} catch (error) {
					this.host.log.warn({ err: error, tabId: this.tabId }, '[collab] pembaruan antar-instance rusak')
				}
				return
			case 'seeded':
				if (!this.epoch) this.becomeSeeded(message.epoch, [message.update])
				else if (message.epoch !== this.epoch) void this.catchUp()
				return
			case 'awareness':
				try {
					applyAwarenessUpdate(this.awareness, message.update, BUS_ORIGIN)
				} catch {
					// Awareness rusak dari instance lain tidak layak memutus siapa pun.
				}
				return
			case 'query-awareness': {
				const states = this.awareness.getStates()
				const local = [...this.conns]
					.flatMap((conn) => [...conn.awarenessClients])
					.filter((id) => states.has(id))
				if (local.length > 0) {
					void this.host.bus.publish(this.tabId, {
						kind: 'awareness',
						update: encodeAwarenessUpdate(this.awareness, local),
					})
				}
				return
			}
			case 'reset':
				this.kill(COLLAB_CLOSE.epoch, 'reset')
				return
			case 'gone':
				this.kill(COLLAB_CLOSE.gone, 'tab deleted')
				return
		}
	}

	/**
	 * Menyamakan diri dengan log di Postgres - setelah pesan pub/sub mungkin
	 * hilang (Redis tersambung ulang), saat turunan kita ternyata tertinggal,
	 * atau saat generasi di pesan tidak cocok. Menerapkan ulang pembaruan yang
	 * sudah ada tidak mengubah apa pun, jadi aman diulang.
	 */
	async catchUp(): Promise<void> {
		if (this.dead) return
		let state: StoredCollabState | null
		try {
			state = await this.host.store.load(this.tabId)
		} catch (error) {
			this.host.log.warn({ err: error, tabId: this.tabId }, '[collab] gagal mengejar dari log')
			return
		}
		if (this.dead) return
		if (!state) {
			if (this.epoch) this.kill(COLLAB_CLOSE.epoch, 'reset')
			return
		}
		if (!this.epoch) {
			this.becomeSeeded(state.epoch, state.updates)
			return
		}
		if (state.epoch !== this.epoch) {
			this.kill(COLLAB_CLOSE.epoch, 'reset')
			return
		}
		this.applyAll(state.updates, CATCHUP_ORIGIN)
	}

	// ── Persistensi ─────────────────────────────────────────────────────────

	private scheduleFlush(delayMs: number): void {
		if (this.flushTimer || this.dead) return
		this.flushTimer = setTimeout(() => {
			this.flushTimer = null
			void this.flush()
		}, delayMs)
	}

	/** Menulis antrean pembaruan sebagai satu baris log; berurutan, tidak pernah dua sekaligus. */
	flush(): Promise<boolean> {
		if (this.flushTimer) {
			clearTimeout(this.flushTimer)
			this.flushTimer = null
		}
		const run = this.flushChain.then(() => this.persistPending())
		this.flushChain = run.catch(() => false)
		return run
	}

	private async persistPending(): Promise<boolean> {
		if (this.pending.length === 0) return true
		if (!this.epoch || this.dead) return false
		const batch = this.pending.splice(0)
		const update = batch.length === 1 ? batch[0] : Y.mergeUpdates(batch)
		const epoch = this.epoch

		let result: 'ok' | 'stale'
		try {
			result = await this.host.store.append(this.tabId, epoch, update)
		} catch (error) {
			// Klien masih memegang pembaruannya dan akan mengirim ulang saat
			// menyambung lagi; di sini cukup dicoba terus selama room hidup.
			this.pending.unshift(update)
			this.host.log.error({ err: error, tabId: this.tabId }, '[collab] gagal mencatat pembaruan, dicoba lagi')
			this.scheduleFlush(1000)
			return false
		}
		if (result === 'stale') {
			this.kill(COLLAB_CLOSE.epoch, 'reset')
			return false
		}
		this.rowsSinceCompact += 1
		void this.host.bus.publish(this.tabId, { kind: 'update', epoch, update })
		if (this.rowsSinceCompact >= this.host.settings.compactEvery) void this.compact()
		return true
	}

	private async compact(): Promise<void> {
		if (this.compacting || !this.epoch || this.dead) return
		this.compacting = true
		try {
			const merged = await this.host.store.compact(this.tabId, this.epoch)
			if (merged > 0) this.rowsSinceCompact = 1
		} catch (error) {
			this.host.log.warn({ err: error, tabId: this.tabId }, '[collab] pemadatan log gagal')
		} finally {
			this.compacting = false
		}
	}

	// ── Turunan JSON untuk pembaca sisi server ─────────────────────────────

	private scheduleDerive(): void {
		if (this.dead) return
		if (this.deriveTimer) clearTimeout(this.deriveTimer)
		this.deriveTimer = setTimeout(() => void this.derive(), this.host.settings.deriveDebounceMs)
		if (!this.deriveDeadline) {
			this.deriveDeadline = setTimeout(() => void this.derive(), this.host.settings.deriveMaxMs)
		}
	}

	derive(): Promise<void> {
		if (this.deriveTimer) clearTimeout(this.deriveTimer)
		if (this.deriveDeadline) clearTimeout(this.deriveDeadline)
		this.deriveTimer = null
		this.deriveDeadline = null
		const run = this.deriveChain.then(() => this.deriveNow())
		this.deriveChain = run.catch((error: unknown) => {
			this.host.log.error({ err: error, tabId: this.tabId }, '[collab] penurunan isi tab gagal')
			if (!this.dead) setTimeout(() => this.scheduleDerive(), 1000)
		})
		return this.deriveChain
	}

	private async deriveNow(): Promise<void> {
		if (this.dead || !this.epoch) return
		// Isi yang diturunkan harus sudah tercatat di log: turunan yang
		// mendahului lognya bisa mencakup pembaruan yang hilang bila proses
		// ini mati, dan semua turunan lain akan dianggap tertinggal.
		for (let attempt = 0; this.pending.length > 0 || attempt === 0; attempt += 1) {
			if (attempt >= 3) return
			if (!(await this.flush())) {
				// Postgres sedang bermasalah; antrean dicoba ulang sendiri, turunan menyusul.
				this.scheduleDerive()
				return
			}
		}
		if (this.dead || !this.epoch) return
		const epoch = this.epoch
		const stateVector = Y.encodeStateVector(this.doc)
		if (stateVectorsEqual(stateVector, this.contentSv)) return
		const content = yFragmentToProseMirrorJSON(this.doc.getXmlFragment(COLLAB_FRAGMENT))

		const outcome = await this.host.store.writeDerived(
			this.tabId,
			epoch,
			content as unknown as Record<string, unknown>,
			stateVector,
		)
		switch (outcome.result) {
			case 'written':
				this.contentSv = stateVector
				this.behindStreak = 0
				this.host.contentDerived(this.tabId, content, this.lastEditor)
				return
			case 'unchanged':
				this.contentSv = stateVector
				this.behindStreak = 0
				return
			case 'behind':
				// Instance lain menurunkan dari state yang kita belum punya: kejar
				// dari log, lalu coba lagi - dengan batas, supaya log yang
				// kehilangan baris tidak membuat putaran tanpa akhir.
				this.behindStreak += 1
				if (this.behindStreak > 3) {
					this.host.log.error({ tabId: this.tabId }, '[collab] turunan terus tertinggal dari yang tersimpan')
					return
				}
				await this.catchUp()
				this.scheduleDerive()
				return
			case 'stale':
				this.kill(COLLAB_CLOSE.epoch, 'reset')
				return
		}
	}

	// ── Penyemaian ──────────────────────────────────────────────────────────

	/**
	 * Memilih satu sambungan penulis yang menunggu untuk menyemai. Kunci Redis
	 * mencegah dua instance meminta dua klien sekaligus; gerbang yang
	 * sesungguhnya tetap baris kepala di Postgres (`seedCollabState`).
	 */
	private elect(): void {
		if (this.dead || this.epoch || this.seeder || this.electing) return
		// Yang paling jarang diminta lebih dulu: klien yang gagal menyemai (sumber
		// isinya tidak terjangkau, atau ia rusak) tidak boleh memblokir yang lain.
		let candidate: CollabConnection | null = null
		for (const conn of this.conns) {
			if (conn.phase !== 'waiting' || !conn.canWrite) continue
			if (!candidate || conn.seedRequests < candidate.seedRequests) candidate = conn
		}
		if (!candidate) return

		this.electing = true
		const holder = `${this.host.bus.instanceId}:${candidate.id}`
		this.host.bus.acquireSeedLock(this.tabId, holder, this.host.settings.seedLockMs).then(
			(acquired) => {
				this.electing = false
				if (!acquired) {
					this.retryElection()
					return
				}
				if (this.dead || this.epoch || candidate.phase !== 'waiting' || !this.conns.has(candidate)) {
					void this.host.bus.releaseSeedLock(this.tabId, holder)
					this.elect()
					return
				}
				this.seeder = candidate
				this.seedHolder = holder
				candidate.seedRequests += 1
				candidate.send(encodeStatus(this.statusFor(candidate, 'seed')))
				this.seedTimer = setTimeout(() => this.onSeedTimeout(candidate), this.host.settings.seedLockMs)
			},
			(error: unknown) => {
				this.electing = false
				this.host.log.warn({ err: error, tabId: this.tabId }, '[collab] gagal mengambil kunci penyemaian')
				this.retryElection()
			},
		)
	}

	private retryElection(): void {
		if (this.electionTimer || this.dead || this.epoch) return
		this.electionTimer = setTimeout(() => {
			this.electionTimer = null
			this.elect()
		}, this.host.settings.electionRetryMs)
	}

	private onSeedTimeout(conn: CollabConnection): void {
		if (this.seeder !== conn) return
		if (this.seeding) {
			// Tulisannya sedang di jalan; tunggu hasilnya.
			this.seedTimer = setTimeout(() => this.onSeedTimeout(conn), this.host.settings.seedLockMs)
			return
		}
		this.host.log.warn({ tabId: this.tabId }, '[collab] penyemai tidak mengirim isi awal; dipilih ulang')
		this.revokeSeeder(conn, true)
	}

	private revokeSeeder(conn: CollabConnection, reelect: boolean): void {
		if (this.seeder !== conn) return
		this.releaseSeedLock()
		if (conn.phase === 'waiting') conn.send(encodeStatus(this.statusFor(conn, 'waiting')))
		if (reelect) this.elect()
	}

	private releaseSeedLock(): void {
		if (this.seedTimer) clearTimeout(this.seedTimer)
		this.seedTimer = null
		this.seeder = null
		if (this.seedHolder) {
			void this.host.bus.releaseSeedLock(this.tabId, this.seedHolder)
			this.seedHolder = null
		}
	}

	private async acceptSeed(conn: CollabConnection, update: Uint8Array): Promise<void> {
		// Hanya dari penyemai yang dipilih, dan hanya sekali.
		if (this.dead || this.epoch || this.seeder !== conn || this.seeding) return
		if (!isSelfContainedUpdate(update)) {
			conn.close(COLLAB_CLOSE.badMessage, 'bad seed')
			return
		}

		this.seeding = true
		const epoch = randomUUID()
		let result: 'seeded' | 'conflict' | 'gone'
		try {
			result = await this.host.store.seed(this.tabId, epoch, update, conn.claims.uid)
		} catch (error) {
			this.seeding = false
			this.host.log.error({ err: error, tabId: this.tabId }, '[collab] gagal menyimpan isi awal')
			this.revokeSeeder(conn, true)
			return
		}
		this.seeding = false
		if (this.dead) return

		switch (result) {
			case 'seeded':
				this.becomeSeeded(epoch, [update])
				if (conn.claims.uid) this.lastEditor = conn.claims.uid
				void this.host.bus.publish(this.tabId, { kind: 'seeded', epoch, update })
				this.host.log.info({ tabId: this.tabId, epoch, bytes: update.byteLength }, '[collab] tab disemai')
				// Turunan pertama menormalkan `document_tabs.content` ke isi room.
				this.scheduleDerive()
				return
			case 'conflict':
				// Instance lain menang lebih dulu; ambil hasilnya dari log.
				this.releaseSeedLock()
				await this.catchUp()
				return
			case 'gone':
				this.kill(COLLAB_CLOSE.gone, 'tab deleted')
				return
		}
	}

	private becomeSeeded(epoch: string, updates: readonly Uint8Array[]): void {
		if (this.epoch || this.dead) return
		this.epoch = epoch
		this.applyAll(updates, SEED_ORIGIN)
		this.releaseSeedLock()
		if (this.electionTimer) clearTimeout(this.electionTimer)
		this.electionTimer = null
		for (const conn of this.conns) {
			if (conn.phase === 'waiting') this.makeReady(conn)
		}
	}
}
