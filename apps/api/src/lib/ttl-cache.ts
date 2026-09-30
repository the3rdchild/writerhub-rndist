/**
 * Cache di memori proses: berumur pendek, berbatas jumlah entri, dan
 * menggabungkan pemuatan serentak untuk kunci yang sama.
 *
 * Dipakai untuk jawaban yang mahal ditanyakan ulang tetapi murah bila sedikit
 * basi, seperti verifikasi token ke pp-backend dan id identitas. Setiap
 * proses/replika punya salinannya sendiri. Itu disengaja: yang dicari di sini
 * adalah memangkas hop yang berulang per permintaan, bukan konsistensi lintas
 * replika, dan TTL-nya menjadi batas atas selisihnya.
 *
 * Penggabungan (single-flight) penting karena web mengirim beberapa permintaan
 * sekaligus untuk satu aksi. Autosave, misalnya, mengirim `PUT /tabs/:id` lalu
 * `GET /documents`. Tanpa penggabungan, cache yang masih kosong tetap
 * meneruskan semuanya ke hulu.
 */

interface Entry<V> {
	value: V
	/** Sebelum titik ini nilainya dipakai tanpa bertanya ke hulu. */
	freshUntil: number
	/** Sampai titik ini nilainya masih boleh dipakai sambil diperbarui di latar. */
	staleUntil: number
}

export interface TtlCacheOptions {
	/** Umur segar satu entri. `0` mematikan penyimpanan; pemuatan serentak tetap digabung. */
	ttlMs: number
	/**
	 * Batas jumlah entri. Entri tertua dibuang lebih dulu, supaya kunci acak
	 * yang terus berganti tidak bisa menumbuhkan memori tanpa batas.
	 */
	maxEntries: number
	/**
	 * Lama entri yang sudah lewat umur segarnya masih boleh dipakai sementara
	 * pembaruannya berjalan di latar (stale-while-revalidate). Pengguna aktif
	 * jadi tidak pernah menunggu hulu yang lambat, dan tetap terlayani selama
	 * hulu mati paling lama selama jendela ini.
	 */
	staleMs?: number
	/**
	 * Apakah galat saat pembaruan di latar membuang entri lamanya. Bawaannya
	 * ya. Kembalikan `false` untuk galat sementara (hulu tidak terjangkau),
	 * supaya entri lamanya tetap melayani sampai jendela basinya habis.
	 */
	evictOnError?: (error: unknown) => boolean
}

export class TtlCache<V> {
	private readonly entries = new Map<string, Entry<V>>()
	private readonly inflight = new Map<string, Promise<V>>()
	private readonly ttlMs: number
	private readonly maxEntries: number
	private readonly staleMs: number
	private readonly evictOnError: (error: unknown) => boolean

	constructor(options: TtlCacheOptions) {
		this.ttlMs = options.ttlMs
		this.maxEntries = options.maxEntries
		this.staleMs = options.staleMs ?? 0
		this.evictOnError = options.evictOnError ?? (() => true)
	}

	/** Nilai yang masih segar, tanpa pernah memuat. */
	get(key: string): V | undefined {
		const entry = this.entries.get(key)
		return entry && Date.now() < entry.freshUntil ? entry.value : undefined
	}

	set(key: string, value: V): void {
		if (this.ttlMs <= 0) return

		const now = Date.now()
		// Hapus dulu supaya urutan sisip Map menjadi urutan umur.
		this.entries.delete(key)
		this.entries.set(key, {
			value,
			freshUntil: now + this.ttlMs,
			staleUntil: now + this.ttlMs + this.staleMs,
		})

		while (this.entries.size > this.maxEntries) {
			const oldest = this.entries.keys().next().value
			if (oldest === undefined) break
			this.entries.delete(oldest)
		}
	}

	delete(key: string): void {
		this.entries.delete(key)
	}

	clear(): void {
		this.entries.clear()
		this.inflight.clear()
	}

	/**
	 * Nilai dari cache, atau hasil `load()` bila belum ada.
	 *
	 * Entri yang lewat umur segar tetapi masih dalam jendela basi langsung
	 * dikembalikan, sementara satu `load()` berjalan di latar.
	 *
	 * Galat dari `load()` diteruskan ke setiap penunggu dan tidak disimpan,
	 * sehingga permintaan berikutnya mencoba lagi. `shouldCache` menyaring
	 * hasil sukses yang tetap tidak boleh disimpan, misalnya `null` dari hulu
	 * yang sedang gagal. Hasil seperti itu juga tidak menimpa entri lama.
	 */
	async getOrLoad(
		key: string,
		load: () => Promise<V>,
		shouldCache: (value: V) => boolean = () => true,
	): Promise<V> {
		const entry = this.entries.get(key)
		const now = Date.now()
		if (entry && now < entry.freshUntil) return entry.value

		if (entry && now < entry.staleUntil) {
			this.load(key, load, shouldCache).catch((error) => {
				if (this.evictOnError(error) && this.entries.get(key) === entry) this.entries.delete(key)
			})
			return entry.value
		}

		if (entry) this.entries.delete(key)
		return this.load(key, load, shouldCache)
	}

	private load(key: string, load: () => Promise<V>, shouldCache: (value: V) => boolean): Promise<V> {
		const pending = this.inflight.get(key)
		if (pending) return pending

		const promise = load()
			.then((value) => {
				if (shouldCache(value)) this.set(key, value)
				return value
			})
			.finally(() => this.inflight.delete(key))

		this.inflight.set(key, promise)
		return promise
	}
}
