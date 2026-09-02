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

/** Tahap yang sedang berjalan selama status masih `generating`. */
export type DraftPhase = 'preparing' | 'writing' | 'saving'

/**
 * Sebab kegagalan dalam bentuk yang bisa diperiksa program - pemanggil tidak
 * perlu mencocokkan kalimat galat untuk memutuskan apakah layak dicoba lagi.
 */
export type DraftErrorCode =
	/** Provider AI tidak bisa dihubungi sama sekali (DNS, jaringan, koneksi ditolak). */
	| 'provider_unreachable'
	/** Provider membalas galat: kunci ditolak, model tidak dikenal, permintaan ditolak. */
	| 'provider_rejected'
	/** Kuota atau rate limit provider habis - layak dicoba lagi nanti. */
	| 'quota_exceeded'
	/** Melewati batas waktu, atau prosesnya berhenti di tengah jalan. */
	| 'timeout'
	/** Provider membalas tanpa naskah sama sekali. */
	| 'empty_response'
	/** Naskahnya jadi, tapi gagal disimpan sebagai isi dokumen. */
	| 'save_failed'
	| 'unknown'

export interface DraftProgress {
	phase: DraftPhase
	/**
	 * 0-100. **Estimasi**, bukan ukuran pasti: jumlah karakter yang sudah
	 * diterima dibagi target panjang yang diminta ke model. Model tidak tahu
	 * panjang keluarannya sendiri, jadi angka ini tidak pernah menyentuh 100
	 * selama naskahnya masih ditulis.
	 */
	percent: number
	/** Karakter naskah yang sudah diterima dari provider. */
	characters: number
	/** Target panjang yang dipakai sebagai pembagi. */
	targetCharacters: number
}

export interface DraftHandoff {
	documentId: string
	tabId: string
	title: string
	status: DraftStatus
	/** Tautan WritingHub yang dibuka pengguna. */
	url: string
	/** Tautan untuk menanyakan status sampai ia tidak lagi `generating`. */
	statusUrl: string
	/** Hanya terisi selama status `generating`. */
	progress?: DraftProgress
	/** Hanya terisi saat status `failed`. */
	error?: string
	errorCode?: DraftErrorCode
}
