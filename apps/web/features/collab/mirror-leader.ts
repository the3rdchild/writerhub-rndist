/**
 * Satu halaman per tab yang mencermin sesi ke Y.Doc besar.
 *
 * Setiap halaman (tab peramban) punya salinan Y.Doc besarnya sendiri, dan
 * semuanya tersimpan ke IndexedDB yang sama. Bila dua halaman sama-sama
 * mencermin perubahan yang sama, masing-masing membuat item Yjs sendiri untuk
 * isi yang sama; setelah muat ulang keduanya tergabung dan naskahnya ganda
 * ("Hello brave brave world"). Jadi giliran mencermin dipegang satu halaman
 * lewat Web Locks, dan halaman yang mendapat giliran mengejar dulu apa yang
 * sudah ditulis halaman lain ke IndexedDB sebelum mencermin.
 */

import { browserLockRequest, type LockRequest } from '@/lib/web-lock'

export type { LockRequest }

/**
 * Minta giliran mencermin tab ini. `onLead` dipanggil saat giliran didapat;
 * giliran dipegang sampai fungsi yang dikembalikan dipanggil (yang juga
 * membatalkan permintaan yang masih menunggu). Tanpa Web Locks, giliran
 * langsung didapat - perilaku satu halaman seperti sebelumnya.
 */
export function holdMirrorLead(
	tabId: string,
	onLead: () => Promise<void> | void,
	request: LockRequest | null = browserLockRequest(),
): () => void {
	if (!request) {
		void onLead()
		return () => {}
	}
	const abort = new AbortController()
	let release: () => void = () => {}
	const held = new Promise<void>((resolve) => {
		release = resolve
	})
	void request(`writer-hub-collab-mirror:${tabId}`, { signal: abort.signal }, async () => {
		if (abort.signal.aborted) return
		await onLead()
		await held
	}).catch(() => {
		// Dibatalkan selagi menunggu, atau `onLead` gagal: giliran dilepas.
	})
	return () => {
		abort.abort()
		release()
	}
}
