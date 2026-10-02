/**
 * Kontrak kolaborasi real-time (SHL-5) antara apps/api dan apps/web.
 *
 * Satu room per TAB server. Di atas websocket berjalan protokol y-websocket
 * standar (sync + awareness dari `y-protocols`), ditambah dua pesan milik kita
 * untuk penyemaian dan status. Alasan setiap keputusan: `docs/collab-realtime.md`.
 */

/** Nama `Y.XmlFragment` naskah di dalam Y.Doc per tab; editor diikat ke field ini. */
export const COLLAB_FRAGMENT = 'content'

/** Jalur websocket di API; nama room (id tab server) ditempel di belakangnya. */
export const COLLAB_WS_PATH = '/api/v1/collab/ws'

/**
 * Tipe pesan di websocket. 0-3 milik y-websocket dan tidak boleh dipakai ulang.
 * Pesan yang tidak dikenali klien y-websocket hanya menulis galat ke konsol,
 * jadi klien WAJIB mendaftarkan penangan untuk `status` dan `seed`.
 */
export const COLLAB_MESSAGE = {
	sync: 0,
	awareness: 1,
	auth: 2,
	queryAwareness: 3,
	/** Server → klien: JSON {@link CollabStatus}. */
	status: 100,
	/** Klien → server: satu pembaruan Yjs berisi naskah awal (hanya dari klien yang diminta). */
	seed: 101,
} as const

/**
 * Kode tutup websocket. Rentang 4400-4499 dianggap permanen oleh y-websocket
 * (tidak menyambung ulang sendiri), jadi klien kitalah yang memutuskan langkah
 * berikutnya; 4500-4599 dan kode standar disambung ulang otomatis.
 */
export const COLLAB_CLOSE = {
	/** Tiket salah, kedaluwarsa, atau sudah waktunya diperbarui: ambil tiket baru lalu sambung lagi. */
	ticket: 4401,
	/** Tidak berhak atas tab ini. */
	forbidden: 4403,
	/** Tab sudah dihapus. */
	gone: 4404,
	/** Salinan lokal berasal dari generasi state lain (state di-reset): buang, lalu sambung dengan epoch kosong. */
	epoch: 4409,
	/** Pesan rusak atau tidak dikenali. */
	badMessage: 4400,
	/** Kolaborasi belum dikonfigurasi atau layanan pendukung sedang bermasalah; coba lagi nanti. */
	unavailable: 4503,
	/** Server berhenti dengan rapi (deploy/restart); sambung lagi, biasanya ke replika lain. */
	restart: 1012,
} as const

export const COLLAB_ROLES = ['editor', 'commenter', 'viewer'] as const
export type CollabRole = (typeof COLLAB_ROLES)[number]

/** Hanya editor yang boleh menulis naskah; commenter belum punya anotasi di Yjs. */
export function collabCanWrite(role: CollabRole): boolean {
	return role === 'editor'
}

/**
 * `waiting`: tab belum punya state Yjs dan klien lain sedang/akan menyemainya.
 * `seed`: klien ini yang diminta menyemai - kirim satu pesan `seed`.
 * `ready`: state ada; sinkronisasi y-websocket berjalan seperti biasa.
 */
export type CollabRoomState = 'waiting' | 'seed' | 'ready'

export interface CollabStatus {
	state: CollabRoomState
	/** Generasi state di server; null selama belum disemai. */
	epoch: string | null
	role: CollabRole
	readOnly: boolean
}

export interface CollabTicketRequest {
	/** Id tab server (bukan id tab lokal di Y.Doc peramban). */
	tabId: string
	/** Akses lewat tautan berbagi; perannya mengikuti tautan itu. */
	shareToken?: string
}

export interface CollabTicket {
	/** Tiket bertanda tangan, dikirim sebagai query `ticket` saat membuka websocket. */
	ticket: string
	/** Batas waktu MEMBUKA sambungan (ms epoch); sambungan yang sudah terbuka tidak ikut putus. */
	expiresAt: number
	tabId: string
	documentId: string
	role: CollabRole
	readOnly: boolean
	/** Generasi state saat tiket dibuat; null bila tab belum pernah disemai. */
	epoch: string | null
	/** Alamat dasar websocket untuk `WebsocketProvider` (tanpa id tab). */
	wsUrl: string
	/** Untuk kehadiran (awareness): nama yang ditampilkan ke kolaborator. */
	user: { id: string; name: string }
}
