import {
	COLLAB_CLOSE,
	COLLAB_FRAGMENT,
	type CollabRole,
	type CollabStatus,
	type CollabTicket,
	collabCanWrite,
} from '@writer-hub/shared'
import { ObservableV2 } from 'lib0/observable'
import { WebsocketProvider } from 'y-websocket'
import * as Y from 'yjs'
import type { CollabLocalStore } from './local-store'
import { type PresenceUser, presenceUser } from './presence'
import { encodeSeedMessage, installCollabHandlers } from './protocol'
import { fetchCollabTicket } from './ticket'

/**
 * Satu tab server yang disunting bersama: Y.Doc-nya, sambungan websocket
 * (y-websocket), tiket, salinan lokal, dan semua kode tutup dari server.
 * Tidak bergantung pada React maupun editor, jadi bisa diuji di Bun.
 *
 * Aturan yang dijaga di sini (alasannya di docs/collab-realtime.md):
 * - Y.Doc hanya pernah berisi SATU generasi state (epoch). Epoch salinan
 *   lokal dikirim saat menyambung; server menolak (4409) bila tidak cocok, dan
 *   sesi lalu membuang Y.Doc itu dan mulai dengan yang baru - tidak pernah
 *   menggabungkan dua generasi.
 * - Tiket diperbarui sendiri: saat ditolak 4401 dan sebelum ia habis.
 * - Penyemaian hanya bila server memintanya, dan isinya dikirim sebagai pesan
 *   tersendiri - tidak pernah ditulis langsung ke Y.Doc yang tersinkron.
 */

export type CollabPhase =
	| 'idle'
	/** Mengambil tiket / membuka websocket. */
	| 'connecting'
	/** Tab belum punya state; klien lain sedang (atau akan) menyemainya. */
	| 'waiting'
	/** Klien ini yang diminta menyemai. */
	| 'seeding'
	/** Terhubung; isi server sedang diterima. */
	| 'syncing'
	/** Tersinkron. */
	| 'synced'
	/** Terputus; suntingan tetap tersimpan lokal dan menyusul saat tersambung. */
	| 'offline'
	/** Berhenti: tidak berhak (403/401). */
	| 'denied'
	/** Berhenti: tab sudah dihapus. */
	| 'gone'
	/** Berhenti: kolaborasi tidak tersedia (503 / tidak dikonfigurasi); pakai simpanan lama. */
	| 'unavailable'
	| 'destroyed'

const TERMINAL: ReadonlySet<CollabPhase> = new Set(['denied', 'gone', 'unavailable', 'destroyed'])
/** 4401 berturut-turut (tanpa sinkron di antaranya) sebelum sesi menyerah sebagai `denied`. */
const MAX_TICKET_REJECTIONS = 6

export interface SeedRequest {
	/**
	 * `initial`: tab belum pernah kolaboratif - salinan lokal boleh dipakai.
	 * `reset`: state di server dibuang (pulihkan versi, draf); isi server yang
	 * berlaku, salinan lokal sudah basi.
	 */
	reason: 'initial' | 'reset'
	ticket: CollabTicket
}

export interface CollabSessionOptions {
	/** Id tab SERVER. */
	tabId: string
	shareToken?: string
	/** Bangun isi awal saat diminta server; null = tidak bisa sekarang (server memilih ulang nanti). */
	seed: (request: SeedRequest) => Promise<Uint8Array | null>
	fetchTicket?: (tabId: string, shareToken?: string) => Promise<CollabTicket>
	/** Salinan luring per tab; null = hanya di memori (uji, peramban tanpa IndexedDB). */
	localStore?: CollabLocalStore | null
	WebSocketPolyfill?: typeof WebSocket
	maxBackoffMs?: number
	/** Membedakan dua tab peramban milik orang yang sama di daftar kehadiran. */
	presenceKey?: string
	/** Tiket yang sisa umurnya kurang dari ini diperbarui sebelum menyambung. */
	ticketMarginMs?: number
	/**
	 * Peran yang dianggap sebelum tiket pertama tiba - menentukan apakah
	 * salinan lokal boleh disunting saat luring. Pemilik tab (aplikasi utama):
	 * `editor`; bawaannya `viewer`.
	 */
	assumeRole?: CollabRole
	/** Sumber peristiwa `online`/`offline`. Bawaannya `window`; null = tidak ada (uji tanpa DOM). */
	network?: NetworkEvents | null
}

export type NetworkEvents = Pick<EventTarget, 'addEventListener' | 'removeEventListener'>

type SessionEvents = {
	phase: (phase: CollabPhase) => void
	status: (status: CollabStatus) => void
	/** Y.Doc diganti (generasi state berganti): ikat ulang editor ke `doc`. */
	doc: (doc: Y.Doc, previous: Y.Doc) => void
	/** Salinan generasi lama akan dibuang; cadangkan isinya sekarang (sinkron) bila perlu. */
	discard: (doc: Y.Doc, epoch: string) => void
	/** Apa pun yang terlihat dari luar berubah (fase, peran, `doc`, `contentReady`). */
	change: () => void
}

function errorStatus(error: unknown): number {
	const status = (error as { status?: unknown } | null)?.status
	return typeof status === 'number' ? status : 0
}

function hasContent(doc: Y.Doc): boolean {
	return doc.getXmlFragment(COLLAB_FRAGMENT).length > 0
}

export class CollabSession extends ObservableV2<SessionEvents> {
	readonly tabId: string
	doc = new Y.Doc()
	provider: WebsocketProvider | null = null
	phase: CollabPhase = 'idle'
	/** Epoch state server terakhir yang diketahui. */
	epoch: string | null = null
	role: CollabRole
	readOnly: boolean
	ticket: CollabTicket | null = null

	/** Nama dan warna di kehadiran; ada setelah tiket pertama. */
	user: PresenceUser | null = null

	/** Generasi isi `doc`; '' selama ia belum menerima apa pun dari server. */
	private docEpoch = ''
	private ready = false
	private present = true
	private attachedEpoch: string | null = null
	private detachStore: (() => void) | null = null
	private seedReason: SeedRequest['reason'] = 'initial'
	private refreshing = false
	private badMessages = 0
	private ticketRejections = 0
	private destroyed = false
	private readonly network: NetworkEvents | null

	constructor(private readonly options: CollabSessionOptions) {
		super()
		this.tabId = options.tabId
		this.role = options.assumeRole ?? 'viewer'
		this.readOnly = !collabCanWrite(this.role)
		this.network =
			options.network !== undefined ? options.network : typeof window !== 'undefined' ? window : null
	}

	/*
	 * Peramban tahu jaringannya putus lebih dulu daripada websocket: soket yang
	 * masih "terbuka" di jaringan yang sudah mati baru ketahuan y-websocket
	 * setelah 30 detik tanpa pesan, dan selama itu indikatornya tetap "Live"
	 * (uji kolab-01). Putus lalu sambung lagi: soketnya ditutup sekarang - fase
	 * 'offline', kehadiran orang lain dihapus - dan provider mencoba ulang
	 * dengan backoff sampai jaringan kembali.
	 */
	private readonly onBrowserOffline = (): void => {
		const provider = this.provider
		if (!provider?.wsconnected) return
		provider.disconnect()
		provider.connect()
	}

	/**
	 * `doc` sudah memegang isi satu generasi yang diakui server: dimuat dari
	 * salinan lokal generasi yang berlaku, atau sudah menerima sync step 2.
	 * Sebelum itu editor jangan diikat ke `doc` - ia kosong, dan cermin dari
	 * Y.Doc kosong akan mengosongkan salinan di Y.Doc besar.
	 */
	get contentReady(): boolean {
		return this.ready
	}

	/**
	 * Hadir (tab aktif) atau tidak (sesi yang dibiarkan hidup di latar sampai
	 * suntingannya terkirim): kolaborator tidak melihat kursor dari tab yang
	 * tidak sedang dibuka.
	 */
	setPresent(present: boolean): void {
		this.present = present
		const awareness = this.provider?.awareness
		if (!awareness) return
		if (!present) awareness.setLocalState(null)
		else if (this.user) awareness.setLocalState({ ...(awareness.getLocalState() ?? {}), user: this.user })
	}

	private setReady(ready: boolean): void {
		if (this.ready === ready) return
		this.ready = ready
		this.emit('change', [])
	}

	async start(): Promise<void> {
		if (this.phase !== 'idle') return
		this.setPhase('connecting')
		this.network?.addEventListener('offline', this.onBrowserOffline)
		// Salinan lokal dimuat DULU, tanpa menunggu jaringan: setelah muat ulang
		// saat luring, tab kolaboratif tetap bisa disunting.
		await this.loadLocalCopy()
		if (this.destroyed) return
		const ticket = await this.obtainTicket()
		if (!ticket || this.destroyed) return
		if (this.attachedEpoch && ticket.epoch !== this.attachedEpoch) {
			// State di server di-reset selama peramban ini tertutup/luring: salinan
			// (beserta suntingan luringnya) dicadangkan lewat `discard`, lalu mulai baru.
			await this.restartWithFreshDoc()
			return
		}
		this.openProvider(ticket, this.docEpoch)
	}

	override destroy(): void {
		if (this.destroyed) return
		this.destroyed = true
		this.network?.removeEventListener('offline', this.onBrowserOffline)
		const provider = this.provider
		this.provider = null
		provider?.destroy()
		this.detachStore?.()
		this.detachStore = null
		this.setPhase('destroyed')
		super.destroy()
	}

	// ── Tiket ───────────────────────────────────────────────────────────────

	private async obtainTicket(): Promise<CollabTicket | null> {
		const fetchTicket = this.options.fetchTicket ?? fetchCollabTicket
		let delay = 500
		while (!this.destroyed) {
			try {
				const ticket = await fetchTicket(this.tabId, this.options.shareToken)
				this.ticket = ticket
				if (this.role !== ticket.role || this.readOnly !== ticket.readOnly) {
					this.role = ticket.role
					this.readOnly = ticket.readOnly
					this.emit('change', [])
				}
				return ticket
			} catch (error) {
				const status = errorStatus(error)
				if (status === 401 || status === 403) return this.stop('denied')
				if (status === 404) return this.stop('gone')
				if (status === 503) return this.stop('unavailable')
				// Jaringan putus atau server sedang bermasalah: coba terus, lebih cepat begitu online.
				this.setPhase('offline')
				await this.pause(delay)
				delay = Math.min(delay * 2, 30_000)
			}
		}
		return null
	}

	private pause(ms: number): Promise<void> {
		return new Promise((resolve) => {
			const done = () => {
				clearTimeout(timer)
				this.network?.removeEventListener('online', done)
				resolve()
			}
			const timer = setTimeout(done, ms)
			this.network?.addEventListener('online', done)
		})
	}

	private ticketExpiresSoon(): boolean {
		return !this.ticket || this.ticket.expiresAt - Date.now() < (this.options.ticketMarginMs ?? 10_000)
	}

	// ── Salinan lokal ───────────────────────────────────────────────────────

	private async loadLocalCopy(): Promise<void> {
		const store = this.options.localStore
		const stored = store?.storedEpoch(this.tabId) ?? null
		if (!store || !stored) return
		this.detachStore = await store.attach(this.tabId, stored, this.doc)
		this.attachedEpoch = stored
		this.docEpoch = stored
		// Salinan generasi yang terakhir diakui server: boleh langsung disunting,
		// juga luring. Bila ternyata basi, server menolaknya (4409) dan sesi
		// mencadangkannya sebelum mulai baru.
		this.setReady(true)
	}

	private async persistLocally(epoch: string): Promise<void> {
		const store = this.options.localStore
		if (!store || this.attachedEpoch === epoch || this.destroyed) return
		this.detachStore?.()
		this.attachedEpoch = epoch
		const detach = await store.attach(this.tabId, epoch, this.doc)
		// Sesi bisa saja sudah berganti generasi atau ditutup selama menunggu IndexedDB.
		if (this.destroyed || this.attachedEpoch !== epoch) detach()
		else this.detachStore = detach
	}

	// ── Websocket ───────────────────────────────────────────────────────────

	private openProvider(ticket: CollabTicket, epoch: string): void {
		const provider = new WebsocketProvider(ticket.wsUrl, this.tabId, this.doc, {
			connect: false,
			params: { ticket: ticket.ticket, epoch },
			// Tab peramban lain di profil yang sama menyinkron lewat server.
			// BroadcastChannel melewati pemeriksaan epoch, dan dua generasi yang
			// bertemu di sana menggandakan naskah.
			disableBc: true,
			maxBackoffTime: this.options.maxBackoffMs ?? 2500,
			WebSocketPolyfill: this.options.WebSocketPolyfill,
			shouldReconnect: (event) => this.shouldReconnect(event),
		})
		installCollabHandlers(provider, (status) => {
			if (provider === this.provider) this.onStatus(status)
		})
		provider.on('sync', (synced: boolean) => {
			if (provider !== this.provider || !synced || !this.epoch) return
			this.ticketRejections = 0
			this.setReady(true)
			this.setPhase('synced')
		})
		provider.on('connection-close', () => {
			if (provider === this.provider && !TERMINAL.has(this.phase)) this.setPhase('offline')
		})
		provider.on('closed', ({ code }: { code: number; reason: string }) => {
			if (provider === this.provider) void this.onServerClose(code)
		})
		this.user = presenceUser(ticket.user, this.options.presenceKey)
		if (this.present) provider.awareness.setLocalStateField('user', this.user)
		else provider.awareness.setLocalState(null)
		this.provider = provider
		provider.connect()
	}

	/** Kode 44xx dan tiket yang hampir habis ditangani sendiri lewat `closed`. */
	private shouldReconnect(event: CloseEvent): boolean {
		if (event.code >= 4400 && event.code < 4500) return false
		return !this.ticketExpiresSoon()
	}

	private async onServerClose(code: number): Promise<void> {
		if (this.destroyed) return
		switch (code) {
			case COLLAB_CLOSE.forbidden:
				this.stop('denied')
				return
			case COLLAB_CLOSE.gone:
				this.stop('gone')
				return
			case COLLAB_CLOSE.epoch:
				await this.restartWithFreshDoc()
				return
			case COLLAB_CLOSE.badMessage:
				// Klien ini mengirim sesuatu yang rusak; jangan berputar tanpa akhir.
				this.badMessages += 1
				if (this.badMessages > 3) {
					this.stop('unavailable')
					return
				}
				await this.reconnectWithFreshTicket()
				return
			case COLLAB_CLOSE.ticket: {
				/*
				 * Satu 4401 itu biasa (otorisasi ulang berkala, tautan berbagi
				 * berubah): langsung ambil tiket baru. Tiket yang TERUS ditolak -
				 * jam berselisih, kunci server berganti - dulu menjadi putaran
				 * puluhan tiket per detik; kini berjeda makin panjang, lalu berhenti.
				 */
				this.ticketRejections += 1
				if (this.ticketRejections > MAX_TICKET_REJECTIONS) {
					this.stop('denied')
					return
				}
				if (this.ticketRejections > 1) {
					await this.pause(Math.min(500 * 2 ** (this.ticketRejections - 2), 15_000))
					if (this.destroyed) return
				}
				await this.reconnectWithFreshTicket()
				return
			}
			default:
				await this.reconnectWithFreshTicket()
		}
	}

	private async reconnectWithFreshTicket(): Promise<void> {
		if (this.refreshing || this.destroyed) return
		this.refreshing = true
		try {
			this.setPhase('connecting')
			const ticket = await this.obtainTicket()
			const provider = this.provider
			if (!ticket || !provider || this.destroyed) return
			provider.params = { ticket: ticket.ticket, epoch: this.docEpoch }
			provider.connect()
		} finally {
			this.refreshing = false
		}
	}

	/**
	 * Server membuang generasi state yang dipegang Y.Doc ini (pulihkan versi,
	 * draf), atau salinan kita dari generasi lain. Y.Doc lama tidak boleh
	 * disambungkan lagi: isinya dicadangkan lewat `discard`, lalu sesi mulai
	 * dengan Y.Doc kosong dan pemilik sesi mengikat ulang editornya (`doc`).
	 */
	private async restartWithFreshDoc(): Promise<void> {
		const previous = this.doc
		const provider = this.provider
		this.provider = null
		provider?.destroy()
		this.detachStore?.()
		this.detachStore = null
		const previousEpoch = this.attachedEpoch ?? (this.docEpoch || null)
		this.attachedEpoch = null

		if (previousEpoch && this.options.localStore) {
			if (hasContent(previous)) this.emit('discard', [previous, previousEpoch])
			await this.options.localStore.discard(this.tabId, previousEpoch)
		} else if (hasContent(previous)) {
			this.emit('discard', [previous, previousEpoch ?? ''])
		}
		if (this.destroyed) return

		this.doc = new Y.Doc()
		this.docEpoch = ''
		this.epoch = null
		this.seedReason = 'reset'
		this.ready = false
		this.emit('doc', [this.doc, previous])
		this.emit('change', [])

		this.setPhase('connecting')
		const ticket = await this.obtainTicket()
		if (!ticket || this.destroyed) return
		this.openProvider(ticket, '')
	}

	// ── Status dari server ──────────────────────────────────────────────────

	private onStatus(status: CollabStatus): void {
		const roleChanged = this.role !== status.role || this.readOnly !== status.readOnly
		this.role = status.role
		this.readOnly = status.readOnly
		this.emit('status', [status])
		if (roleChanged) this.emit('change', [])
		switch (status.state) {
			case 'waiting':
				this.setPhase('waiting')
				return
			case 'seed':
				void this.sendSeed()
				return
			case 'ready': {
				const epoch = status.epoch ?? ''
				this.epoch = status.epoch
				this.docEpoch = epoch
				this.badMessages = 0
				// Sambung ulang otomatis (y-websocket) harus mengaku generasi ini:
				// tanpa itu, Y.Doc berisi generasi lama bisa diterima room yang
				// sudah disemai ulang - dan naskahnya berganda.
				if (this.provider) this.provider.params = { ...this.provider.params, epoch }
				if (epoch) void this.persistLocally(epoch)
				this.seedReason = 'initial'
				this.setPhase(this.provider?.synced ? 'synced' : 'syncing')
				return
			}
		}
	}

	private async sendSeed(): Promise<void> {
		const ticket = this.ticket
		if (!ticket) return
		this.setPhase('seeding')
		let update: Uint8Array | null = null
		try {
			update = await this.options.seed({ reason: this.seedReason, ticket })
		} catch {
			update = null
		}
		const socket = this.provider?.ws
		// Tanpa isi (sumbernya tidak terjangkau) cukup diam: server memberi
		// giliran ke klien lain setelah kuncinya habis, atau kembali ke kita.
		if (!update || !socket || socket.readyState !== 1) {
			if (this.phase === 'seeding') this.setPhase('waiting')
			return
		}
		socket.send(encodeSeedMessage(update))
	}

	// ── Fase ────────────────────────────────────────────────────────────────

	private stop(phase: 'denied' | 'gone' | 'unavailable'): null {
		// Fase dulu: `disconnect` memancarkan connection-close, dan fase akhir
		// tidak boleh tertimpa 'offline'.
		this.setPhase(phase)
		this.provider?.disconnect()
		return null
	}

	private setPhase(phase: CollabPhase): void {
		if (this.phase === phase || this.phase === 'destroyed') return
		this.phase = phase
		this.emit('phase', [phase])
		this.emit('change', [])
	}
}
