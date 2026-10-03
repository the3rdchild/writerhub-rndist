import { IndexeddbPersistence } from 'y-indexeddb'
import * as Y from 'yjs'
import { watchPersistence } from '@/features/sessions/local-persistence'

/**
 * Salinan lokal Y.Doc tab kolaboratif: suntingan luring tetap tersimpan dan
 * terkirim begitu tersambung lagi (ini juga menutup SHL-7 untuk naskah).
 *
 * Satu basis data IndexedDB per (tab, epoch). Epoch ikut di nama supaya dua
 * generasi state tidak pernah bercampur di satu basis data - menggabungkan
 * keduanya menggandakan naskah. Generasi yang ditolak server dibuang utuh.
 */
export interface CollabLocalStore {
	/** Epoch salinan yang tersimpan untuk tab ini, atau null. */
	storedEpoch(tabId: string): string | null
	/** Muat salinan generasi `epoch` ke `doc`, lalu simpan setiap perubahannya. Nilai baliknya melepas. */
	attach(tabId: string, epoch: string, doc: Y.Doc): Promise<() => void>
	/**
	 * Isi salinan generasi `epoch` yang tersimpan, sebagai satu pembaruan Yjs;
	 * null bila kosong atau tidak terbaca. Memuat juga tulisan halaman lain
	 * (tab peramban lain) ke salinan yang sama.
	 */
	read(tabId: string, epoch: string): Promise<Uint8Array | null>
	/** Buang salinan generasi `epoch` (pemanggil sudah mencadangkannya bila perlu). */
	discard(tabId: string, epoch: string): Promise<void>
}

const EPOCHS_KEY = 'writer-hub-collab-epochs'

function readEpochs(): Record<string, string> {
	try {
		const parsed = JSON.parse(window.localStorage.getItem(EPOCHS_KEY) ?? '{}') as unknown
		return parsed && typeof parsed === 'object' ? (parsed as Record<string, string>) : {}
	} catch {
		return {}
	}
}

function writeEpochs(epochs: Record<string, string>): void {
	try {
		window.localStorage.setItem(EPOCHS_KEY, JSON.stringify(epochs))
	} catch {
		// Penyimpanan penuh atau diblokir: salinan tetap ada, hanya tidak dikenali saat muat ulang.
	}
}

function databaseName(tabId: string, epoch: string): string {
	return `writer-hub-collab:${tabId}:${epoch}`
}

export const indexeddbCollabStore: CollabLocalStore = {
	storedEpoch(tabId) {
		if (typeof window === 'undefined') return null
		return readEpochs()[tabId] ?? null
	},

	async attach(tabId, epoch, doc) {
		const persistence = new IndexeddbPersistence(databaseName(tabId, epoch), doc)
		// IndexedDB yang diblokir tidak boleh menggantung sesi: tanpa salinan
		// lokal kolaborasi tetap jalan, hanya tidak tahan luring.
		const available = await new Promise<boolean>((resolve) => {
			watchPersistence(persistence, { onReady: () => resolve(true), onUnavailable: () => resolve(false) })
		})
		if (!available) return () => {}
		writeEpochs({ ...readEpochs(), [tabId]: epoch })
		return () => {
			void Promise.resolve(persistence.destroy()).catch(() => {})
		}
	},

	async read(tabId, epoch) {
		const scratch = new Y.Doc()
		const persistence = new IndexeddbPersistence(databaseName(tabId, epoch), scratch)
		try {
			const available = await new Promise<boolean>((resolve) => {
				watchPersistence(persistence, { onReady: () => resolve(true), onUnavailable: () => resolve(false) })
			})
			if (!available || scratch.store.clients.size === 0) return null
			return Y.encodeStateAsUpdate(scratch)
		} finally {
			await Promise.resolve(persistence.destroy()).catch(() => {})
			scratch.destroy()
		}
	},

	async discard(tabId, epoch) {
		const scratch = new Y.Doc()
		try {
			await new IndexeddbPersistence(databaseName(tabId, epoch), scratch).clearData()
		} catch {
			// Basis data yang tidak bisa dibuka juga tidak bisa dibuang; namanya sudah tidak dipakai lagi.
		} finally {
			scratch.destroy()
		}
		const epochs = readEpochs()
		if (epochs[tabId] === epoch) {
			delete epochs[tabId]
			writeEpochs(epochs)
		}
	},
}
