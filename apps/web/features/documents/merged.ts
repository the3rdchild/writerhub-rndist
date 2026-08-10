import type { DocMeta } from '@/features/sessions/ydoc'
import type { DocumentSummary } from './types'

/**
 * Penggabungan daftar dokumen lokal (Y.Doc) dan dokumen server.
 *
 * Sebelum ini Riwayat di menu WritingHub membaca yang lokal dan Library membaca
 * yang server, jadi keduanya menampilkan himpunan yang berbeda dengan tampilan
 * yang tampak setara - dokumen yang belum pernah disimpan ke cloud hanya ada di
 * satu tempat, dokumen lama yang sudah tidak terbuka hanya ada di tempat lain.
 * Keduanya kini memakai daftar yang sama.
 *
 * Fungsi murni supaya aturan penggabungannya bisa diuji tanpa React maupun Yjs.
 */

export type DocumentOrigin =
	/** Ada di perangkat ini saja; belum punya baris di server. */
	| 'local-only'
	/** Ada di keduanya - dokumen lokal yang tabnya sudah tertaut. */
	| 'synced'
	/** Ada di server saja; belum (atau sedang tidak) terbuka di perangkat ini. */
	| 'server-only'

export interface MergedDocument {
	/** Kunci render yang stabil; id lokal bila ada, kalau tidak id server. */
	key: string
	localId: string | null
	serverId: string | null
	title: string
	updatedAt: number
	tabCount: number
	projectId: string | null
	origin: DocumentOrigin
}

/**
 * Gabungkan kedua daftar.
 *
 * `serverIdOf` memetakan id dokumen lokal ke id dokumen server lewat kaitan tab
 * (`SyncContext.serverDocId`). Dokumen lokal yang petanya menemukan baris server
 * dianggap dokumen yang sama - bukan dua entri.
 *
 * Judul diambil dari sisi lokal untuk dokumen tertaut: itu yang sedang dilihat
 * dan disunting pengguna, dan penyelarasan judul (`resolveTitle`) sudah
 * memastikan keduanya bertemu. Waktunya diambil yang paling baru dari kedua
 * sisi supaya urutan "terakhir dikerjakan" tidak mundur hanya karena satu sisi
 * belum sempat tersinkron.
 */
export function mergeDocuments(
	local: readonly DocMeta[],
	server: readonly DocumentSummary[],
	serverIdOf: (localId: string) => string | null,
): MergedDocument[] {
	const byServerId = new Map(server.map((entry) => [entry.id, entry]))
	const claimed = new Set<string>()
	const merged: MergedDocument[] = []

	for (const dok of local) {
		const serverId = serverIdOf(dok.id)
		const row = serverId ? byServerId.get(serverId) : undefined

		if (row) claimed.add(row.id)

		merged.push({
			key: dok.id,
			localId: dok.id,
			serverId: row?.id ?? null,
			title: dok.title,
			updatedAt: Math.max(dok.updatedAt, row?.updatedAt ?? 0),
			// Jumlah tab lokal yang dipakai, bukan milik server: tab yang baru
			// dibuat dan belum tersimpan tetap harus terhitung.
			tabCount: dok.tabOrder.length,
			projectId: row?.projectId ?? null,
			origin: row ? 'synced' : 'local-only',
		})
	}

	for (const row of server) {
		if (claimed.has(row.id)) continue
		merged.push({
			key: row.id,
			localId: null,
			serverId: row.id,
			title: row.title,
			updatedAt: row.updatedAt,
			tabCount: row.tabCount,
			projectId: row.projectId,
			origin: 'server-only',
		})
	}

	return merged.sort((a, b) => b.updatedAt - a.updatedAt)
}

/**
 * Saring hasil gabungan menurut filter proyek Library.
 *
 * Dokumen lokal-saja belum punya baris di server, jadi ia belum bisa bernaung
 * di proyek mana pun: ia ikut pada "semua" dan "tanpa proyek", tapi tidak
 * pernah muncul saat sebuah proyek dipilih - menampilkannya di sana berarti
 * menjanjikan keanggotaan yang tidak ada.
 */
export function filterByProject(
	documents: readonly MergedDocument[],
	filter: string,
): MergedDocument[] {
	if (filter === 'all') return [...documents]
	if (filter === 'none') return documents.filter((dok) => dok.projectId === null)
	return documents.filter((dok) => dok.projectId === filter)
}
