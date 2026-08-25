import type { JSONContent } from '@tiptap/core'
import type { VersionDetail, VersionSummary, VersionTrigger } from './types'

/**
 * Penyimpanan versi lokal (Iterasi 2 rencana): IndexedDB mentah di atas
 * database `writer-hub-versions`, object store `versions` (keyPath `id`,
 * index `tabId`). Tanpa dependency baru - hanya pola promise kecil di atas
 * `indexedDB.open`.
 *
 * Bentuk entri meniru `VersionSummary`/`VersionDetail` server (ditambah
 * `tabId` sebagai pengganti `document_id`), sehingga UI riwayat yang sama
 * dipakai untuk tab lokal dan dokumen cloud. Versi lokal tidak pernah
 * diunggah: saat tab "Simpan ke cloud", riwayat di server mulai dari nol
 * dan arsip lokal tetap di browser.
 */

const DB_NAME = 'writer-hub-versions'
const STORE_NAME = 'versions'
const TAB_INDEX = 'tabId'

/** Trigger yang bisa dibuat dari sisi web; `pre_translate` milik fitur lain. */
export type LocalVersionTrigger = Extract<VersionTrigger, 'manual' | 'interval' | 'pre_restore'>

/** Entri persis seperti yang tersimpan di object store. */
export interface LocalVersionEntry {
	id: string
	tabId: string
	content: JSONContent
	trigger: LocalVersionTrigger
	label: string | null
	wordCount: number
	/** Epoch milidetik. */
	createdAt: number
}

/**
 * Hitung jumlah kata dari JSON ProseMirror: rekursi seluruh node, jumlahkan
 * kata di tiap `node.text` (dipisah spasi). Sengaja disamakan persis dengan
 * `countWords` di backend (`apps/api/src/services/versions/service.ts`) supaya
 * angka di lini masa tidak berubah makna antara versi lokal dan cloud.
 */
export function countWords(content: JSONContent): number {
	let count = 0
	const walk = (node: JSONContent): void => {
		if (typeof node.text === 'string' && node.text.trim()) {
			count += node.text.trim().split(/\s+/).length
		}
		if (Array.isArray(node.content)) {
			for (const child of node.content) walk(child)
		}
	}
	walk(content)
	return count
}

/**
 * Pilih id versi `interval` yang dipangkas: semua di luar `keep` yang terbaru.
 * Versi `manual`/`pre_restore` tidak pernah ikut dipangkas - sama dengan
 * `pruneIntervalVersions` di backend. Fungsi murni agar bisa diuji tanpa IDB.
 */
export function selectIntervalIdsToPrune(
	versions: Pick<LocalVersionEntry, 'id' | 'trigger' | 'createdAt'>[],
	keep = 50,
): string[] {
	const intervals = versions
		.filter((version) => version.trigger === 'interval')
		.sort((a, b) => b.createdAt - a.createdAt)
	return intervals.slice(keep).map((version) => version.id)
}

let dbPromise: Promise<IDBDatabase> | null = null

function openDb(): Promise<IDBDatabase> {
	dbPromise ??= new Promise((resolve, reject) => {
		const request = indexedDB.open(DB_NAME, 1)
		request.onupgradeneeded = () => {
			const db = request.result
			if (!db.objectStoreNames.contains(STORE_NAME)) {
				db.createObjectStore(STORE_NAME, { keyPath: 'id' }).createIndex(TAB_INDEX, 'tabId', {
					unique: false,
				})
			}
		}
		request.onsuccess = () => resolve(request.result)
		request.onerror = () =>
			reject(request.error ?? new Error('Gagal membuka penyimpanan versi lokal'))
	})
	return dbPromise
}

/** Jalankan satu request di atas store; transaksi mengurus dirinya sendiri. */
async function run<T>(
	mode: IDBTransactionMode,
	action: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
	const db = await openDb()
	return new Promise<T>((resolve, reject) => {
		const request = action(db.transaction(STORE_NAME, mode).objectStore(STORE_NAME))
		request.onsuccess = () => resolve(request.result)
		request.onerror = () =>
			reject(request.error ?? new Error('Operasi penyimpanan versi lokal gagal'))
	})
}

/** Semua entri mentah sebuah tab (belum diurutkan). */
function readEntries(tabId: string): Promise<LocalVersionEntry[]> {
	return run('readonly', (store) => store.index(TAB_INDEX).getAll(tabId))
}

function toSummary(entry: LocalVersionEntry): VersionSummary {
	return {
		id: entry.id,
		trigger: entry.trigger,
		label: entry.label,
		wordCount: entry.wordCount,
		createdAt: entry.createdAt,
		// Versi lokal tidak pernah trigger `ai_result` (lihat LocalVersionTrigger).
		feature: null,
	}
}

/** Daftar versi satu tab, terbaru di atas - bentuknya sama dengan API server. */
export async function listLocalVersions(tabId: string): Promise<VersionSummary[]> {
	const entries = await readEntries(tabId)
	return entries.sort((a, b) => b.createdAt - a.createdAt).map(toSummary)
}

/** Baca satu versi beserta naskahnya untuk pratinjau/restore. */
export async function getLocalVersion(
	tabId: string,
	id: string,
): Promise<VersionDetail | null> {
	const entry = await run('readonly', (store) => store.get(id) as IDBRequest<LocalVersionEntry | undefined>)
	if (!entry || entry.tabId !== tabId) return null
	return { ...toSummary(entry), content: entry.content }
}

/** Simpan snapshot baru; `id`, `wordCount`, dan `createdAt` diisi di sini. */
export async function insertLocalVersion(input: {
	tabId: string
	content: JSONContent
	trigger: LocalVersionTrigger
	label?: string | null
}): Promise<LocalVersionEntry> {
	const entry: LocalVersionEntry = {
		id: crypto.randomUUID(),
		tabId: input.tabId,
		content: input.content,
		trigger: input.trigger,
		label: input.label ?? null,
		wordCount: countWords(input.content),
		createdAt: Date.now(),
	}
	await run('readwrite', (store) => store.put(entry))
	return entry
}

/** Hapus versi `interval` di luar `keep` terbaru; versi lain tidak dipangkas. */
export async function pruneLocalIntervalVersions(tabId: string, keep = 50): Promise<void> {
	const ids = selectIntervalIdsToPrune(await readEntries(tabId), keep)
	for (const id of ids) {
		await run('readwrite', (store) => store.delete(id))
	}
}

/** Hapus seluruh versi satu tab (dipakai saat tabnya dihapus). */
export async function deleteLocalVersionsForTab(tabId: string): Promise<void> {
	const keys = await run('readonly', (store) => store.index(TAB_INDEX).getAllKeys(tabId))
	for (const key of keys) {
		await run('readwrite', (store) => store.delete(key))
	}
}

/**
 * Hapus versi semua tab yang tidak ada di `keepTabIds`. Dipakai efek prune di
 * sync-context: tab lokal tidak punya catatan linkage, jadi satu-satunya cara
 * tahu versi yatim adalah membaca tabId yang benar-benar tersimpan.
 */
export async function deleteLocalVersionsExcept(keepTabIds: ReadonlySet<string>): Promise<void> {
	const entries = await run('readonly', (store) => store.getAll() as IDBRequest<LocalVersionEntry[]>)
	const orphans = new Set(entries.map((entry) => entry.tabId))
	for (const tabId of orphans) {
		if (!keepTabIds.has(tabId)) await deleteLocalVersionsForTab(tabId)
	}
}
