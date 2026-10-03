/**
 * Keputusan "tab ini disimpan ke mana" untuk simpanan cloud (SHL-6).
 *
 * Dulu setiap tab yang belum tertaut menjadi dokumen server BARU, jadi satu
 * dokumen lokal bertab tiga bisa menjadi tiga dokumen server, dan tab yang
 * ditambahkan ke dokumen yang sudah di cloud tetap "Hanya tersimpan lokal".
 * Aturannya kini: dokumen lokal yang SATU tabnya sudah di cloud adalah dokumen
 * cloud - tab lain (lama, baru, duplikat) masuk ke dokumen server yang sama.
 */

import { type LockRequest, withWebLock } from '@/lib/web-lock'

export interface TabLink {
	documentId: string
}

export interface LocalDocument {
	id: string
	tabOrder: string[]
}

/** Dokumen server milik dokumen lokal ini: dari tab pertama yang sudah tertaut. */
export function serverDocumentOf(
	document: LocalDocument,
	linkage: Readonly<Record<string, TabLink>>,
): string | null {
	for (const tabId of document.tabOrder) {
		const documentId = linkage[tabId]?.documentId
		if (documentId) return documentId
	}
	return null
}

export type CloudSavePlan =
	/** Tab sudah tertaut: kirim isinya ke tab servernya. */
	| { kind: 'push' }
	/** Dokumennya sudah di cloud: buat tab server baru di dokumen itu. */
	| { kind: 'add-tab'; documentId: string }
	/** Belum ada apa pun di cloud: buat dokumen server baru dari tab ini. */
	| { kind: 'create-document' }

export function planCloudSave(
	tabId: string,
	documents: readonly LocalDocument[],
	linkage: Readonly<Record<string, TabLink>>,
): CloudSavePlan {
	if (linkage[tabId]) return { kind: 'push' }
	const owner = documents.find((document) => document.tabOrder.includes(tabId))
	const documentId = owner ? serverDocumentOf(owner, linkage) : null
	return documentId ? { kind: 'add-tab', documentId } : { kind: 'create-document' }
}

/**
 * Tab yang dokumennya sudah di cloud tetapi tab itu sendiri belum: tab baru,
 * duplikat, atau tab yang dulu tidak ikut disimpan. Urutannya urutan tab,
 * dan `limit` membatasi berapa yang dikerjakan sekaligus.
 */
export function tabsAwaitingCloud(
	documents: readonly LocalDocument[],
	linkage: Readonly<Record<string, TabLink>>,
	busy: ReadonlySet<string>,
	limit = Number.POSITIVE_INFINITY,
): Array<{ tabId: string; documentId: string }> {
	const result: Array<{ tabId: string; documentId: string }> = []
	for (const document of documents) {
		const documentId = serverDocumentOf(document, linkage)
		if (!documentId) continue
		for (const tabId of document.tabOrder) {
			if (result.length >= limit) return result
			if (!linkage[tabId] && !busy.has(tabId)) result.push({ tabId, documentId })
		}
	}
	return result
}

/**
 * Membuat tab server untuk satu tab lokal paling banyak SEKALI di semua
 * halaman. Setiap halaman (tab peramban) memegang tautan cloud-nya sendiri di
 * memori; tanpa kunci, dua halaman yang sama-sama melihat tab baru di dokumen
 * cloud masing-masing membuat tab server. Di dalam kunci, tautan yang sudah
 * disimpan halaman lain (`readStored`) dipakai; `create` wajib menyimpan
 * tautannya sebelum selesai, supaya halaman berikutnya melihatnya.
 */
export async function linkTabOnce<L>({
	tabId,
	request,
	readStored,
	create,
}: {
	tabId: string
	request: LockRequest | null
	readStored: () => L | null
	create: () => Promise<L>
}): Promise<{ linkage: L; created: boolean }> {
	return withWebLock(
		`writer-hub-link:${tabId}`,
		async () => {
			const stored = readStored()
			if (stored) return { linkage: stored, created: false }
			return { linkage: await create(), created: true }
		},
		request,
	)
}
