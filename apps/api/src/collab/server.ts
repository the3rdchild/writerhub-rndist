import { COLLAB_CLOSE } from '@writer-hub/shared'
import type { ProseMirrorJSON } from '@writer-hub/shared/collab-json'
import type { Context } from 'hono'
import { env } from '@/config/env'
import { isUuid } from '@/constants/patterns'
import LoggerClient from '@/lib/logger'
import { snapshotIntervalTab } from '@/services/tabs/service'
import { type CollabBus, getCollabBus } from './bus'
import { CollabConnection } from './connection'
import { registerCollabLocalHandler } from './notify'
import { CollabRoom, CollabTabGoneError, type RoomHost, type RoomSettings, type RoomStore } from './room'
import { collabTicketSigner, roomSettingsFromEnv } from './settings'
import {
	appendCollabUpdate,
	checkShareGrant,
	compactCollabUpdates,
	loadCollabState,
	loadCollabUpdate,
	seedCollabState,
	tabExists,
	writeDerivedContent,
} from './store'
import type { CollabClaims } from './ticket'

/** Penyimpanan room plus pemeriksaan yang dibutuhkan manajer saat sambungan masuk. */
export interface ManagerStore extends RoomStore {
	checkShareGrant(claims: CollabClaims): Promise<'ok' | 'revoked' | 'changed'>
}

const log = LoggerClient.getInstance()

/** `ws.data` setiap websocket kolaborasi; diisi saat upgrade. */
export interface CollabSocketData {
	tabId: string
	clientEpoch: string
	claims: CollabClaims | null
	/** Upgrade tetap dilakukan supaya klien menerima kode tutup yang bermakna (peramban menyembunyikan status HTTP handshake). */
	reject: { code: number; reason: string } | null
	conn: CollabConnection | null
}

type CollabServerWebSocket = Bun.ServerWebSocket<CollabSocketData>

const postgresStore: ManagerStore = {
	tabExists,
	load: loadCollabState,
	append: appendCollabUpdate,
	loadUpdate: loadCollabUpdate,
	seed: seedCollabState,
	writeDerived: writeDerivedContent,
	compact: compactCollabUpdates,
	checkShareGrant,
}

/**
 * Semua room di proses ini. Room dimuat saat sambungan pertama datang dan
 * dilepas `COLLAB_ROOM_IDLE_S` setelah sambungan terakhir pergi - setelah
 * antrean tulisnya habis dan isinya diturunkan.
 */
export class CollabManager implements RoomHost {
	readonly log = log
	private readonly rooms = new Map<string, CollabRoom>()
	private readonly loading = new Map<string, Promise<CollabRoom>>()
	private readonly unloadTimers = new Map<CollabRoom, ReturnType<typeof setTimeout>>()
	private stopping = false

	constructor(
		readonly bus: CollabBus,
		readonly store: ManagerStore,
		readonly settings: RoomSettings,
		private readonly idleMs: number,
	) {
		registerCollabLocalHandler({
			onReset: (tabId) => this.rooms.get(tabId)?.kill(COLLAB_CLOSE.epoch, 'reset'),
			onGone: (tabId) => this.rooms.get(tabId)?.kill(COLLAB_CLOSE.gone, 'tab deleted'),
			onShareChanged: (tabId, shareId) => this.rooms.get(tabId)?.dropShareConnections(shareId),
		})
		bus.onReconnect = () => {
			log.warn({ rooms: this.rooms.size }, '[collab] langganan Redis pulih; room mengejar dari log')
			for (const room of this.rooms.values()) void room.catchUp()
		}
	}

	get stats(): { rooms: number; connections: number } {
		let connections = 0
		for (const room of this.rooms.values()) connections += room.conns.size
		return { rooms: this.rooms.size, connections }
	}

	private async roomFor(tabId: string): Promise<CollabRoom> {
		const existing = this.rooms.get(tabId)
		if (existing && !existing.dead) return existing
		const pending = this.loading.get(tabId)
		if (pending) return pending

		const promise = (async () => {
			const room = new CollabRoom(tabId, this)
			try {
				await room.load()
			} catch (error) {
				await room.destroy()
				throw error
			}
			// Reset yang tiba selama memuat sudah mematikannya; sambungan yang
			// bergabung ditolak 4409 dan room baru dimuat saat mereka kembali.
			if (!room.dead) this.rooms.set(tabId, room)
			return room
		})()
		this.loading.set(tabId, promise)
		try {
			return await promise
		} finally {
			this.loading.delete(tabId)
		}
	}

	// ── RoomHost ────────────────────────────────────────────────────────────

	roomEmpty(room: CollabRoom): void {
		if (room.dead || this.stopping) return
		const previous = this.unloadTimers.get(room)
		if (previous) clearTimeout(previous)
		this.unloadTimers.set(
			room,
			setTimeout(() => void this.unload(room), this.idleMs),
		)
	}

	roomDead(room: CollabRoom): void {
		this.forget(room)
		void room.destroy()
	}

	contentDerived(tabId: string, content: ProseMirrorJSON, editor: string | null): void {
		void snapshotIntervalTab(tabId, content as unknown as Record<string, unknown>, editor ?? 'collab')
	}

	private forget(room: CollabRoom): void {
		const timer = this.unloadTimers.get(room)
		if (timer) clearTimeout(timer)
		this.unloadTimers.delete(room)
		if (this.rooms.get(room.tabId) === room) this.rooms.delete(room.tabId)
	}

	private async unload(room: CollabRoom): Promise<void> {
		this.unloadTimers.delete(room)
		if (room.dead || room.conns.size > 0) return
		try {
			await room.settle()
		} catch (error) {
			log.error({ err: error, tabId: room.tabId }, '[collab] gagal menyimpan room sebelum dilepas')
		}
		// Sambungan baru datang selama menyimpan: room tetap hidup.
		if (room.dead || room.conns.size > 0) return
		this.forget(room)
		await room.destroy()
	}

	// ── Websocket ───────────────────────────────────────────────────────────

	open(ws: CollabServerWebSocket): void {
		const data = ws.data
		if (data.reject || !data.claims) {
			ws.close(data.reject?.code ?? COLLAB_CLOSE.ticket, data.reject?.reason ?? 'unauthorized')
			return
		}
		if (this.stopping) {
			ws.close(COLLAB_CLOSE.restart, 'server restarting')
			return
		}

		const conn = new CollabConnection(ws, data.claims, data.clientEpoch)
		data.conn = conn
		if (env.COLLAB_REAUTH_S > 0) {
			conn.reauthTimer = setTimeout(
				() => conn.close(COLLAB_CLOSE.ticket, 'reauth'),
				env.COLLAB_REAUTH_S * 1000,
			)
		}
		void this.admit(conn, data.tabId)
	}

	/**
	 * Tiket tautan berbagi diperiksa ulang terhadap tautan yang berlaku: tiket
	 * yang masih sah (±60 dtk), dipakai menyambung ulang setelah tautannya
	 * dicabut atau diturunkan, tidak boleh membawa peran lama. Pesan yang tiba
	 * selama pemeriksaan ditampung di `inbox` seperti saat room dimuat.
	 */
	private async admit(conn: CollabConnection, tabId: string): Promise<void> {
		if (conn.viaShareLink) {
			let grant: 'ok' | 'revoked' | 'changed'
			try {
				grant = await this.store.checkShareGrant(conn.claims)
			} catch (error) {
				log.error({ err: error, tabId }, '[collab] gagal memeriksa tautan berbagi')
				conn.close(COLLAB_CLOSE.unavailable, 'share check failed')
				return
			}
			if (grant === 'revoked') {
				conn.close(COLLAB_CLOSE.forbidden, 'share revoked')
				return
			}
			if (grant === 'changed') {
				conn.close(COLLAB_CLOSE.ticket, 'share changed')
				return
			}
		}
		if (conn.phase === 'closed') return

		this.roomFor(tabId).then(
			(room) => {
				if (conn.phase === 'closed') {
					if (room.conns.size === 0) this.roomEmpty(room)
					return
				}
				const timer = this.unloadTimers.get(room)
				if (timer) clearTimeout(timer)
				this.unloadTimers.delete(room)
				room.attach(conn)
			},
			(error: unknown) => {
				if (error instanceof CollabTabGoneError) {
					conn.close(COLLAB_CLOSE.gone, 'tab deleted')
					return
				}
				log.error({ err: error, tabId }, '[collab] room gagal dimuat')
				conn.close(COLLAB_CLOSE.unavailable, 'room unavailable')
			},
		)
	}

	message(ws: CollabServerWebSocket, message: string | Buffer): void {
		const conn = ws.data.conn
		if (!conn || conn.phase === 'closed') return
		if (typeof message === 'string') {
			conn.close(COLLAB_CLOSE.badMessage, 'text frames are not supported')
			return
		}
		// Disalin: potongan pesan ini bisa tinggal lama (antrean tulis, isi
		// biner di Y.Doc), dan kita tidak menggantungkan diri pada Bun untuk
		// tidak memakai ulang memorinya.
		const data = new Uint8Array(message)
		if (conn.phase === 'loading' || !conn.room) {
			conn.inbox.push(data)
			return
		}
		conn.room.receive(conn, data)
	}

	close(ws: CollabServerWebSocket): void {
		const conn = ws.data.conn
		if (!conn) return
		conn.markClosed()
		conn.room?.detach(conn)
	}

	/** Simpan semua room lalu putus kliennya dengan 1012, supaya mereka pindah ke replika lain. */
	async shutdown(): Promise<void> {
		this.stopping = true
		registerCollabLocalHandler(null)
		for (const timer of this.unloadTimers.values()) clearTimeout(timer)
		this.unloadTimers.clear()
		const rooms = [...this.rooms.values()]
		await Promise.all(
			rooms.map(async (room) => {
				try {
					await room.settle()
				} catch (error) {
					log.error({ err: error, tabId: room.tabId }, '[collab] gagal menyimpan room saat berhenti')
				}
				for (const conn of [...room.conns]) conn.close(COLLAB_CLOSE.restart, 'server restarting')
				await room.destroy()
			}),
		)
		this.rooms.clear()
	}
}

/*
 * Manajer disimpan di globalThis karena `bun --hot` (stack dev) mengevaluasi
 * ulang modul ini tanpa mematikan proses. Generasi lama dimatikan di sini:
 * kliennya menerima 1012 dan menyambung ulang ke kode yang baru, alih-alih
 * room lama hidup terus dengan langganan Redis yang bocor.
 */
const runtime = globalThis as typeof globalThis & { __collabManager?: CollabManager }
if (runtime.__collabManager) {
	void runtime.__collabManager.shutdown()
	runtime.__collabManager = undefined
}

export function getCollabManager(): CollabManager {
	if (!runtime.__collabManager) {
		runtime.__collabManager = new CollabManager(
			getCollabBus(),
			postgresStore,
			roomSettingsFromEnv(),
			env.COLLAB_ROOM_IDLE_S * 1000,
		)
	}
	return runtime.__collabManager
}

/**
 * Manajernya TIDAK dilepas: sambungan yang masih sempat masuk selama proses
 * berhenti harus ditolak (1012), bukan memuat room baru.
 */
export async function shutdownCollab(): Promise<void> {
	await runtime.__collabManager?.shutdown()
}

/** Satu-satunya penangan websocket di `Bun.serve`; semua websocket API saat ini milik kolaborasi. */
export const collabWebSocketHandler: Bun.WebSocketHandler<CollabSocketData> = {
	data: {} as CollabSocketData,
	maxPayloadLength: env.COLLAB_MAX_MESSAGE_MB * 1024 * 1024,
	// Lebih besar dari satu pesan terbesar (sync awal naskah bergambar), supaya
	// klien lambat diputus karena menumpuk, bukan karena satu pesan besar.
	backpressureLimit: env.COLLAB_MAX_MESSAGE_MB * 2 * 1024 * 1024,
	closeOnBackpressureLimit: true,
	idleTimeout: 120,
	sendPings: true,
	perMessageDeflate: true,
	open: (ws) => getCollabManager().open(ws),
	message: (ws, message) => getCollabManager().message(ws, message),
	close: (ws) => runtime.__collabManager?.close(ws),
}

/**
 * `GET /api/v1/collab/ws/:tabId?ticket=…&epoch=…`
 *
 * Tiketnya diperiksa di sini (HMAC, murah), tapi penolakan tetap disampaikan
 * SETELAH upgrade sebagai kode tutup: peramban tidak pernah memperlihatkan
 * status HTTP handshake yang gagal, sedangkan klien harus tahu bedanya "ambil
 * tiket baru" (4401) dengan "jaringan putus".
 */
export function upgradeCollabSocket(c: Context): Response {
	const server = c.env as Bun.Server<CollabSocketData> | undefined
	const tabId = c.req.param('tabId') ?? ''
	const rawEpoch = c.req.query('epoch') ?? ''
	const signer = collabTicketSigner()

	let reject: CollabSocketData['reject'] = null
	let claims: CollabClaims | null = null
	if (!signer) {
		reject = { code: COLLAB_CLOSE.unavailable, reason: 'collaboration is not configured' }
	} else {
		const verdict = signer.verify(c.req.query('ticket'))
		if (!verdict.ok) reject = { code: COLLAB_CLOSE.ticket, reason: verdict.reason }
		else if (verdict.claims.tab !== tabId)
			reject = { code: COLLAB_CLOSE.ticket, reason: 'ticket is for another tab' }
		else claims = verdict.claims
	}

	const data: CollabSocketData = {
		tabId,
		// Epoch yang bukan UUID diperlakukan sebagai salinan basi: ditolak 4409, klien mulai bersih.
		clientEpoch: rawEpoch === '' || isUuid(rawEpoch) ? rawEpoch : 'invalid',
		claims,
		reject,
		conn: null,
	}
	if (server && typeof server.upgrade === 'function' && server.upgrade(c.req.raw, { data })) {
		// Bun mengabaikan jawaban ini setelah upgrade berhasil.
		return new Response(null)
	}
	return c.json({ message: 'Upgrade Required', errors: ['Endpoint ini hanya menerima websocket'] }, 426)
}
