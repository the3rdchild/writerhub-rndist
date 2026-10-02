import * as Y from 'yjs'

/**
 * Apakah state dengan state vector `next` sudah memuat SEMUA yang dimuat
 * `stored` (setiap clock klien ≥). State vector tidak pernah mundur, termasuk
 * setelah garbage collection, jadi perbandingan ini aman dipakai sebagai
 * penanda "turunan ini tidak lebih basi dari yang tersimpan".
 */
export function stateVectorCovers(next: Uint8Array, stored: Uint8Array | null | undefined): boolean {
	if (!stored || stored.length === 0) return true
	const ours = Y.decodeStateVector(next)
	for (const [client, clock] of Y.decodeStateVector(stored)) {
		if ((ours.get(client) ?? 0) < clock) return false
	}
	return true
}

export function stateVectorsEqual(
	a: Uint8Array | null | undefined,
	b: Uint8Array | null | undefined,
): boolean {
	if (!a || !b) return !a && !b
	const left = Y.decodeStateVector(a)
	const right = Y.decodeStateVector(b)
	if (left.size !== right.size) return false
	for (const [client, clock] of left) {
		if (right.get(client) !== clock) return false
	}
	return true
}

/**
 * Gabungkan sekumpulan pembaruan menjadi satu snapshot. Lewat Y.Doc (bukan
 * `Y.mergeUpdates`) supaya isi yang sudah dihapus ikut dipadatkan oleh
 * garbage collection; struktur yang masih menunggu ketergantungannya tetap
 * ikut tersimpan (`encodeStateAsUpdate` menyertakan pending structs).
 */
export function snapshotOf(updates: Iterable<Uint8Array>): Uint8Array {
	const doc = new Y.Doc({ gc: true })
	try {
		doc.transact(() => {
			for (const update of updates) Y.applyUpdate(doc, update)
		})
		return Y.encodeStateAsUpdate(doc)
	} finally {
		doc.destroy()
	}
}
