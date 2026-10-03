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

/*
 * Tanda isi turunan (`collab_documents.content_sv`): state vector DAN delete
 * set, dikodekan sebagai `Y.encodeSnapshot`. State vector saja tidak cukup -
 * hapusan Yjs tidak menaikkannya, jadi "pemilik menghapus paragraf lalu
 * berhenti mengetik" terlihat seperti tidak ada perubahan, dan instance yang
 * punya sisipan lebih baru tetapi belum menerima hapusan itu tampak "lebih
 * maju" lalu menulis isi tanpa hapusannya.
 */
export function contentMarkOf(doc: Y.Doc): Uint8Array {
	return Y.encodeSnapshot(Y.snapshot(doc))
}

function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
	if (a.byteLength !== b.byteLength) return false
	for (let index = 0; index < a.byteLength; index += 1) if (a[index] !== b[index]) return false
	return true
}

/**
 * null bila tidak ada atau tidak dikenali - termasuk tanda versi lama yang
 * hanya berisi state vector (kadang lolos diurai sebagai snapshot ngawur,
 * karena itu dicek dengan mengodekannya kembali).
 */
function decodeMark(mark: Uint8Array | null | undefined): Y.Snapshot | null {
	if (!mark || mark.byteLength === 0) return null
	try {
		const snapshot = Y.decodeSnapshot(mark)
		return sameBytes(Y.encodeSnapshot(snapshot), mark) ? snapshot : null
	} catch {
		return null
	}
}

/** Rentang [start, end) seluruhnya terhapus menurut `items` (urut menurut clock). */
function rangeDeleted(
	items: ReadonlyArray<{ clock: number; len: number }>,
	start: number,
	end: number,
): boolean {
	let reached = start
	for (const item of items) {
		if (item.clock + item.len <= reached) continue
		if (item.clock > reached) return false
		reached = item.clock + item.len
		if (reached >= end) return true
	}
	return reached >= end
}

/**
 * `next` memuat semua yang dimuat `stored`: setiap sisipan (state vector) dan
 * setiap hapusan (delete set). Tanda tersimpan yang tidak dikenali dianggap
 * tercakup - turunan berikutnya menulis tanda dengan bentuk yang baru.
 */
export function contentMarkCovers(next: Uint8Array, stored: Uint8Array | null | undefined): boolean {
	const old = decodeMark(stored)
	if (!old) return true
	const current = decodeMark(next)
	if (!current) return false
	for (const [client, clock] of old.sv) {
		if ((current.sv.get(client) ?? 0) < clock) return false
	}
	for (const [client, deleted] of old.ds.clients) {
		const ours = [...(current.ds.clients.get(client) ?? [])].sort((a, b) => a.clock - b.clock)
		for (const item of deleted) {
			if (!rangeDeleted(ours, item.clock, item.clock + item.len)) return false
		}
	}
	return true
}

/** Isi yang sama: saling mencakup. Tanda yang tidak dikenali tidak pernah sama dengan apa pun. */
export function contentMarksEqual(
	a: Uint8Array | null | undefined,
	b: Uint8Array | null | undefined,
): boolean {
	if (!decodeMark(a) || !decodeMark(b)) return false
	return contentMarkCovers(a as Uint8Array, b) && contentMarkCovers(b as Uint8Array, a)
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
