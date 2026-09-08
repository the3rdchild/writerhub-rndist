'use client'

/**
 * Penjaga penyimpanan lokal (IndexedDB).
 *
 * Seluruh layar dulu digantungkan pada satu peristiwa: `synced` dari
 * `IndexeddbPersistence`. Kalau peristiwa itu tidak pernah datang — storage
 * diblokir kebijakan peramban, jendela pribadi tanpa IndexedDB, koneksi lain
 * memblokir pembukaan DB — maka `loaded` tidak pernah menyala, dokumen pertama
 * tidak pernah dibuat, dan editornya menggantung tanpa satu pun pesan: y-indexeddb
 * menelan kegagalannya sebagai promise yang ditolak diam-diam.
 *
 * Modul ini mengubah "menggantung selamanya" menjadi "jalan tanpa simpanan, dan
 * bilang begitu". Kegagalan dikenali dari dua arah: promise pembukaan DB yang
 * ditolak (cepat, jalur yang lazim) dan tenggat waktu (untuk pembukaan yang
 * menggantung atau transaksi yang gagal setelah DB terbuka).
 */

/** Batas menunggu `synced` sebelum dokumen dijalankan tanpa simpanan. */
export const PERSISTENCE_TIMEOUT_MS = 10_000

export interface WatchableProvider {
	on: (event: 'synced', handler: () => void) => void
	off: (event: 'synced', handler: () => void) => void
	destroy: () => Promise<void> | void
	/*
	 * Promise pembukaan IndexedDB milik y-indexeddb. Bukan API resminya, jadi
	 * dibaca dengan hati-hati: kalau medan ini hilang di versi lain, penjaga ini
	 * kehilangan deteksi cepatnya saja - tenggat waktunya tetap menangkap.
	 */
	_db?: Promise<unknown>
}

export interface WatchOptions {
	/** Simpanan terbaca: dokumen dijalankan dengan persistensi utuh. */
	onReady: () => void
	/** Simpanan tidak bisa dipakai: dokumen tetap dijalankan, tapi di memori saja. */
	onUnavailable: () => void
	timeoutMs?: number
}

/**
 * Memantau satu provider sampai simpanannya siap ATAU dinyatakan gagal — tepat
 * sekali, mana pun yang lebih dulu. Nilai baliknya menghentikan pemantauan
 * (untuk pembersihan efek React) tanpa memanggil kedua kaitnya.
 */
export function watchPersistence(provider: WatchableProvider, options: WatchOptions): () => void {
	const { onReady, onUnavailable, timeoutMs = PERSISTENCE_TIMEOUT_MS } = options
	let settled = false

	const stop = () => {
		if (settled) return false
		settled = true
		clearTimeout(timer)
		provider.off('synced', ready)
		return true
	}

	function ready() {
		if (stop()) onReady()
	}

	const fail = () => {
		if (!stop()) return
		/*
		 * Provider dimatikan SEBELUM jalur daruratnya jalan. Kalau simpanannya
		 * datang terlambat, ia tidak boleh lagi menempel ke dokumen yang sudah
		 * kadung diisi dokumen kosong - isinya akan berganda. `destroy()` menyetel
		 * `_destroyed`, dan y-indexeddb memeriksanya sebelum menerapkan pembaruan.
		 */
		try {
			Promise.resolve(provider.destroy()).catch(() => {})
		} catch {}
		onUnavailable()
	}

	const timer = setTimeout(fail, timeoutMs)

	provider.on('synced', ready)
	/* Penolakan di sini juga membungkam "unhandled rejection"-nya y-indexeddb. */
	provider._db?.catch(() => fail())

	return () => {
		stop()
	}
}
