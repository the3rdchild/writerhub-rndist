import type * as Y from 'yjs'
import { fragmentToJSON } from '@/features/sync/serialize'
import {
	getLocalVersion,
	insertLocalVersion,
	type LocalVersionTrigger,
	listLocalVersions,
	pruneLocalIntervalVersions,
} from './local-store'

/**
 * Snapshot interval untuk tab lokal (Iterasi 2 rencana): tanpa server tidak
 * ada autosave yang bisa menjadi pijakan versi, jadi web sendiri yang
 * membekukan naskah tiap 10 menit suntingan - konstanta dan aturannya sama
 * dengan `maybeCreateIntervalSnapshot` di backend.
 *
 * Keputusan "kapan memotret" butuh versi terakhir + isinya, dan membacanya
 * dari IndexedDB di tiap ketukan terlalu mahal. Karena itu tiap tab punya
 * cache kecil `{ at, json }` yang diisi sekali dari store lalu dirawat oleh
 * setiap snapshot berikutnya (interval, manual, pre_restore, restore).
 */

/** Jarak minimal antar snapshot interval otomatis (10 menit, sama dengan backend). */
export const LOCAL_INTERVAL_SNAPSHOT_MS = 10 * 60_000

/**
 * Aturan snapshot interval, disamakan dengan backend: di dalam jendela 10
 * menit tidak memotret; di luarnya hanya memotret bila konten berubah.
 * Fungsi murni agar bisa diuji tanpa IDB.
 */
export function shouldSnapshotInterval(
	lastAt: number,
	lastJson: string,
	currentJson: string,
	now: number,
): boolean {
	if (now - lastAt <= LOCAL_INTERVAL_SNAPSHOT_MS) return false
	return lastJson !== currentJson
}

const lastByTab = new Map<string, { at: number; json: string }>()
/** Tab yang cache-nya sedang diisi dari store; ketukan berikutnya menunggu. */
const loadingTabs = new Set<string>()

/** Catat snapshot terbaru sebuah tab ke cache (dipakai semua jalur pemotret). */
export function rememberLocalSnapshot(tabId: string, at: number, json: string): void {
	lastByTab.set(tabId, { at, json })
}

/**
 * Bekukan keadaan fragmen `tabId` sekarang sebagai versi lokal. Tanpa penjaga
 * 10 menit - dipakai Ctrl+S, "Beri nama versi ini", dan pre-restore, yang
 * semuanya aksi eksplisit. Mengembalikan `false` bila IndexedDB gagal
 * (snapshot lokal tidak boleh membunyikan aksi utamanya).
 */
export async function snapshotLocalVersion(
	doc: Y.Doc,
	tabId: string,
	trigger: LocalVersionTrigger,
	label?: string,
): Promise<boolean> {
	const content = fragmentToJSON(doc, tabId)
	try {
		const entry = await insertLocalVersion({ tabId, content, trigger, label })
		rememberLocalSnapshot(tabId, entry.createdAt, JSON.stringify(content))
		if (trigger === 'interval') await pruneLocalIntervalVersions(tabId)
		return true
	} catch {
		return false
	}
}

/**
 * Potret interval bila waktunya tiba (dipanggil dari `doc.on('update')`).
 * Mengembalikan `true` hanya bila versi baru benar-benar tercipta, supaya
 * pemanggil bisa menginvalidasi query riwayat.
 */
export async function maybeSnapshotLocalInterval(doc: Y.Doc, tabId: string): Promise<boolean> {
	const cached = lastByTab.get(tabId)
	if (cached) {
		const content = fragmentToJSON(doc, tabId)
		if (!shouldSnapshotInterval(cached.at, cached.json, JSON.stringify(content), Date.now())) {
			return false
		}
		return snapshotLocalVersion(doc, tabId, 'interval')
	}

	// Cache belum ada: isi dulu dari store. Ketukan yang datang selagi pemuatan
	// dilewatkan - kehilangan satu kesempatan memotret tidak berarti apa-apa.
	if (loadingTabs.has(tabId)) return false
	loadingTabs.add(tabId)
	try {
		const [latest] = await listLocalVersions(tabId)
		if (!latest) {
			// Belum ada versi sama sekali: snapshot interval pertama.
			return await snapshotLocalVersion(doc, tabId, 'interval')
		}
		const detail = await getLocalVersion(tabId, latest.id)
		rememberLocalSnapshot(tabId, latest.createdAt, JSON.stringify(detail?.content ?? null))
	} catch {
		return false
	} finally {
		loadingTabs.delete(tabId)
	}

	// Cache sudah terisi - update yang memicu pemuatan ini bisa jadi sudah
	// melewati 10 menit dari versi terakhir, jadi langsung dievaluasi ulang.
	return maybeSnapshotLocalInterval(doc, tabId)
}
