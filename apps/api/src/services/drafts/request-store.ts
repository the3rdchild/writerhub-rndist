import redis from '@/config/redis'
import LoggerClient from '@/lib/logger'
import type { DraftRequest } from './dto'

/**
 * Menyimpan permintaan draf supaya bisa ditulis ulang.
 *
 * Tanpa ini, satu-satunya cara mencoba lagi adalah mengirim ulang seluruh
 * permintaan - dan yang paling butuh tombol "coba lagi" justru pihak yang tidak
 * memilikinya: penulis yang membuka tautannya di browser tidak pernah melihat
 * prompt aslinya.
 *
 * Yang disimpan hanya badan permintaan yang sudah divalidasi. Kredensial
 * provider tidak pernah ikut - ia diselesaikan ulang dari token pemanggil pada
 * setiap percobaan.
 */

const KEY_PREFIX = 'draft:request:'

/** Sama panjang dengan umur catatan status - sesudahnya, mencoba lagi berarti mengirim ulang. */
const TTL_SECONDS = 24 * 60 * 60

const log = LoggerClient.getInstance()

function key(documentId: string): string {
	return `${KEY_PREFIX}${documentId}`
}

export async function rememberDraftRequest(documentId: string, request: DraftRequest): Promise<void> {
	try {
		await redis.setex(key(documentId), TTL_SECONDS, JSON.stringify(request))
	} catch (error) {
		// Kehilangan salinan permintaan hanya menghapus kemungkinan mencoba
		// lagi; draf yang sedang ditulis tidak terpengaruh.
		log.error({ err: error, documentId }, 'Gagal menyimpan permintaan draf')
	}
}

export async function recallDraftRequest(documentId: string): Promise<DraftRequest | null> {
	try {
		const raw = await redis.get(key(documentId))
		return raw ? (JSON.parse(raw) as DraftRequest) : null
	} catch (error) {
		log.error({ err: error, documentId }, 'Gagal membaca permintaan draf')
		return null
	}
}
