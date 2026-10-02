/**
 * Coba ulang simpanan cloud yang gagal (SHL-7).
 *
 * Dulu kegagalan hanya menyalakan lencana "Gagal menyimpan ke cloud", dan
 * isinya baru terkirim kalau pengguna mengetik lagi - setelah jaringan pulih
 * pun. Kini setiap tab yang gagal dicoba lagi dengan jeda yang memanjang
 * (2, 4, 8 … 60 dtk), dan semuanya dicoba saat itu juga begitu peramban
 * kembali online.
 */

export function retryDelayMs(attempt: number, baseMs = 2000, maxMs = 60_000): number {
	return Math.min(maxMs, baseMs * 2 ** Math.max(0, attempt))
}

interface Entry {
	attempt: number
	timer: ReturnType<typeof setTimeout> | null
}

export class RetryScheduler {
	private readonly entries = new Map<string, Entry>()

	constructor(
		private readonly run: (key: string) => void,
		private readonly options: { baseMs?: number; maxMs?: number } = {},
	) {}

	/** Jadwalkan percobaan berikutnya untuk `key`; jedanya memanjang setiap kali. */
	schedule(key: string): number {
		const entry = this.entries.get(key) ?? { attempt: 0, timer: null }
		if (entry.timer) clearTimeout(entry.timer)
		const delay = retryDelayMs(entry.attempt, this.options.baseMs, this.options.maxMs)
		entry.attempt += 1
		entry.timer = setTimeout(() => {
			entry.timer = null
			this.run(key)
		}, delay)
		this.entries.set(key, entry)
		return delay
	}

	/** Berhasil (atau tidak perlu lagi): lupakan hitungannya. */
	clear(key: string): void {
		const entry = this.entries.get(key)
		if (entry?.timer) clearTimeout(entry.timer)
		this.entries.delete(key)
	}

	has(key: string): boolean {
		return this.entries.has(key)
	}

	/** Jaringan kembali: coba semuanya sekarang, dan jedanya mulai dari awal lagi. */
	retryAllNow(): void {
		for (const [key, entry] of [...this.entries]) {
			if (entry.timer) clearTimeout(entry.timer)
			entry.timer = null
			entry.attempt = 0
			this.run(key)
		}
	}

	dispose(): void {
		for (const entry of this.entries.values()) {
			if (entry.timer) clearTimeout(entry.timer)
		}
		this.entries.clear()
	}
}
