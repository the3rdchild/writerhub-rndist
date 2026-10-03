import type * as Y from 'yjs'

/**
 * Tab cloud yang disunting di salinan lokal (fragmen tab di Y.Doc besar)
 * selagi editornya TIDAK terikat ke sesi kolaborasi: luring sebelum tab itu
 * pernah tersambung di peramban ini, sebelum sesinya sempat dibuat, atau tab
 * baru yang sesinya belum memegang isi.
 *
 * Suntingan itu tidak boleh hilang diam-diam saat sesi tab itu memegang isi
 * dan cermin menimpa salinan lokal. Tandanya disimpan (tahan muat ulang), dan
 * `CollabProvider` membereskannya: dibawa ke sesi bila sesi itu disemai dari
 * salinan ini, atau dicadangkan sebagai versi + pemberitahuan bila isinya
 * berbeda dari isi server.
 */
export interface LocalEdits {
	has(tabId: string): boolean
	mark(tabId: string): void
	clear(tabId: string): void
	/** Waktu suntingan lokal terakhir di tab ini selama halaman ini terbuka; 0 bila belum ada. */
	lastEditAt(tabId: string): number
	/** Tab bertanda saat ini; rujukannya hanya berganti saat isinya berubah (`useSyncExternalStore`). */
	snapshot(): ReadonlySet<string>
	subscribe(listener: () => void): () => void
}

const STORAGE_KEY = 'writer-hub-collab-local-edits'

type KeyValueStorage = Pick<Storage, 'getItem' | 'setItem'>

export function createLocalEdits(storage: KeyValueStorage | null): LocalEdits {
	const read = (): Set<string> => {
		try {
			const parsed = JSON.parse(storage?.getItem(STORAGE_KEY) ?? '[]') as unknown
			return new Set(Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : [])
		} catch {
			return new Set()
		}
	}
	const tabs = read()
	let current: ReadonlySet<string> = new Set(tabs)
	const times = new Map<string, number>()
	const listeners = new Set<() => void>()
	const changed = () => {
		current = new Set(tabs)
		try {
			storage?.setItem(STORAGE_KEY, JSON.stringify([...tabs]))
		} catch {
			// Penyimpanan penuh atau diblokir: tandanya tetap berlaku selama halaman ini terbuka.
		}
		for (const listener of listeners) listener()
	}

	return {
		has: (tabId) => tabs.has(tabId),
		mark(tabId) {
			times.set(tabId, Date.now())
			if (tabs.has(tabId)) return
			tabs.add(tabId)
			changed()
		},
		clear(tabId) {
			times.delete(tabId)
			if (!tabs.delete(tabId)) return
			changed()
		},
		lastEditAt: (tabId) => times.get(tabId) ?? 0,
		snapshot: () => current,
		subscribe(listener) {
			listeners.add(listener)
			return () => {
				listeners.delete(listener)
			}
		},
	}
}

function browserStorage(): KeyValueStorage | null {
	try {
		return typeof window === 'undefined' ? null : window.localStorage
	} catch {
		return null
	}
}

export const localEdits: LocalEdits = createLocalEdits(browserStorage())

/** Transaksi ini mengubah isi fragmen tab `tabId` di Y.Doc besar (di kedalaman mana pun)? */
export function touchesTab(transaction: Y.Transaction, doc: Y.Doc, tabId: string): boolean {
	const fragment = doc.share.get(tabId)
	return fragment !== undefined && transaction.changedParentTypes.has(fragment)
}
