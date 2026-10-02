import type { NewDocumentTab } from '@/db/schemas'
import LoggerClient from '@/lib/logger'
import { getCollabBus } from './bus'
import { replaceContentResettingCollab } from './store'

/**
 * Kabar dari jalur HTTP biasa ke room kolaborasi: state tab di-reset, atau
 * tabnya hilang. Sengaja TIDAK mengimpor manajer room - layanan (tabs,
 * versions, drafts) mengimpor berkas ini, dan room mengimpor layanan tabs
 * untuk snapshot versi; manajer mendaftarkan penangannya sendiri di sini.
 */

const log = LoggerClient.getInstance()

export interface CollabLocalHandler {
	onReset(tabId: string): void
	onGone(tabId: string): void
	onShareChanged(tabId: string, shareId: string): void
}

let localHandler: CollabLocalHandler | null = null

export function registerCollabLocalHandler(handler: CollabLocalHandler | null): void {
	localHandler = handler
}

/**
 * Menulis isi tab dari sisi server (pulihkan versi, draf) sekaligus membuang
 * state Yjs-nya dalam SATU transaksi, lalu menyuruh room yang sedang hidup
 * memutus kliennya (4409). Satu transaksi itu penting: room yang menurunkan
 * isi di sela-selanya bisa menimpa isi baru dengan isi lama, dan penyemai
 * berikutnya mengisi ulang room dari isi yang salah.
 */
export async function writeTabContentFromServer(
	tabId: string,
	values: Partial<NewDocumentTab>,
): ReturnType<typeof replaceContentResettingCollab> {
	const outcome = await replaceContentResettingCollab(tabId, values)
	if (outcome.reset) {
		log.info({ tabId }, '[collab] state Yjs di-reset karena isi tab ditulis server')
		localHandler?.onReset(tabId)
		void getCollabBus().publish(tabId, { kind: 'reset' })
	}
	return outcome
}

/** Tab sudah dihapus (state Yjs ikut terhapus lewat kunci asing): tutup sambungannya (4404). */
export function notifyCollabTabsGone(tabIds: readonly string[]): void {
	for (const tabId of tabIds) {
		localHandler?.onGone(tabId)
		void getCollabBus().publish(tabId, { kind: 'gone' })
	}
}

/**
 * Peran tautan berbagi diubah atau tautannya dicabut: putus sambungan yang
 * masuk lewat tautan itu (4401), supaya izinnya diperiksa ulang saat mengambil
 * tiket - bukan tetap berlaku sampai otorisasi ulang sejam kemudian.
 */
export function notifyCollabShareChanged(shareId: string, tabIds: readonly string[]): void {
	for (const tabId of tabIds) {
		localHandler?.onShareChanged(tabId, shareId)
		void getCollabBus().publish(tabId, { kind: 'share-changed', shareId })
	}
}
