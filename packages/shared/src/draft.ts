/**
 * Serah-terima draf dari klien eksternal ke WritingHub: satu permintaan
 * "buatkan …" - misalnya dari AI Chat PPE - ditukar dengan tautan dokumen yang
 * bisa langsung dibuka penulisnya.
 *
 * Bentuk ini dilihat `apps/api` (yang menyusunnya) dan `apps/web` (yang
 * menanyakan statusnya sampai draf selesai ditulis), jadi ia tinggal di sini.
 */

/**
 * `generating` berarti isinya masih ditulis di latar belakang; dokumen dan
 * tautannya sudah ada sejak detik pertama.
 */
export type DraftStatus = 'generating' | 'ready' | 'failed'

export interface DraftHandoff {
	documentId: string
	tabId: string
	title: string
	status: DraftStatus
	/** Tautan WritingHub yang dibuka pengguna. */
	url: string
	/** Tautan untuk menanyakan status sampai ia tidak lagi `generating`. */
	statusUrl: string
	/** Hanya terisi saat status `failed`. */
	error?: string
}
