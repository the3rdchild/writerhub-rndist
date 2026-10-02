import { randomUUID } from 'node:crypto'
import { collabCanWrite } from '@writer-hub/shared'
import type { CollabRoom } from './room'
import type { CollabClaims } from './ticket'

/** Bagian `ServerWebSocket` Bun yang dipakai; antarmuka sempit supaya room bisa diuji tanpa soket sungguhan. */
export interface CollabSocket {
	send(data: Uint8Array, compress?: boolean): number
	close(code?: number, reason?: string): void
}

/**
 * `loading`: room sedang dimuat, pesan masuk ditampung.
 * `waiting`: tab belum disemai; hanya awareness yang mengalir.
 * `ready`: sinkronisasi penuh.
 */
export type ConnectionPhase = 'loading' | 'waiting' | 'ready' | 'closed'

/** Pesan sekecil ini tidak layak dikompres (permessage-deflate). */
const COMPRESS_MIN_BYTES = 1024

export class CollabConnection {
	readonly id = randomUUID()
	phase: ConnectionPhase = 'loading'
	room: CollabRoom | null = null
	/** Pesan yang tiba sebelum room siap, diputar ulang saat bergabung. */
	readonly inbox: Uint8Array[] = []
	/** Sync step 1 klien yang belum bisa dijawab karena tab belum disemai. */
	pendingStateVector: Uint8Array | null = null
	/** Id klien awareness yang dikendalikan sambungan ini; dibersihkan saat ia tutup. */
	readonly awarenessClients = new Set<number>()
	droppedWrites = 0
	/** Berapa kali sambungan ini sudah diminta menyemai; pemilihan berikutnya mendahulukan yang belum. */
	seedRequests = 0
	reauthTimer: ReturnType<typeof setTimeout> | null = null

	constructor(
		private readonly socket: CollabSocket,
		readonly claims: CollabClaims,
		/** Epoch salinan lokal yang diakui klien saat menyambung; '' = tanpa salinan. */
		readonly clientEpoch: string,
	) {}

	get canWrite(): boolean {
		return collabCanWrite(this.claims.role)
	}

	send(data: Uint8Array): void {
		if (this.phase === 'closed') return
		try {
			this.socket.send(data, data.byteLength >= COMPRESS_MIN_BYTES)
		} catch {
			// Soket yang sedang menutup bisa melempar; penutupannya diurus `close`.
		}
	}

	/** Menutup dari sisi server; room langsung melepasnya tanpa menunggu kabar dari Bun. */
	close(code: number, reason: string): void {
		if (this.phase === 'closed') return
		this.markClosed()
		try {
			this.socket.close(code, reason)
		} catch {
			// Sudah tertutup dari sisi lain.
		}
		this.room?.detach(this)
	}

	/** Dipanggil saat soketnya sudah tertutup (oleh klien atau oleh kita). */
	markClosed(): void {
		this.phase = 'closed'
		if (this.reauthTimer) clearTimeout(this.reauthTimer)
		this.reauthTimer = null
	}
}
