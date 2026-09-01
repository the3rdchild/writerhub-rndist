import type { DraftStatus } from '@writer-hub/shared'
import redis from '@/config/redis'
import LoggerClient from '@/lib/logger'

/**
 * Status generasi draf, disimpan di Redis dan berumur pendek.
 *
 * Kenapa bukan kolom di basis data: yang perlu diingat hanyalah "isinya masih
 * ditulis" selama beberapa menit sesudah dokumen dibuat. Sesudah draf tersimpan
 * di tabnya, dokumen itu tidak berbeda dari dokumen mana pun - tidak ada yang
 * perlu diingat lagi, dan sebuah kolom permanen justru akan basi.
 */

const KEY_PREFIX = 'draft:status:'

/** Sisa umur catatan sesudah draf selesai; cukup untuk penerima tautan yang membukanya belakangan. */
const TTL_SECONDS = 24 * 60 * 60

const log = LoggerClient.getInstance()

export interface DraftState {
	status: DraftStatus
	error?: string
}

function key(documentId: string): string {
	return `${KEY_PREFIX}${documentId}`
}

async function write(documentId: string, state: DraftState): Promise<void> {
	try {
		await redis.setex(key(documentId), TTL_SECONDS, JSON.stringify(state))
	} catch (error) {
		// Statusnya alat bantu, bukan sumber kebenaran naskah. Gagal mencatat
		// tidak boleh menggagalkan draf yang isinya sudah tersimpan.
		log.error({ err: error, documentId }, 'Gagal mencatat status draf')
	}
}

export function markGenerating(documentId: string): Promise<void> {
	return write(documentId, { status: 'generating' })
}

export function markReady(documentId: string): Promise<void> {
	return write(documentId, { status: 'ready' })
}

export function markFailed(documentId: string, error: string): Promise<void> {
	return write(documentId, { status: 'failed', error })
}

/**
 * Dokumen tanpa catatan dianggap `ready`: tidak ada generasi yang tertunda
 * untuknya - entah karena naskahnya datang siap pakai, atau karena catatannya
 * sudah kedaluwarsa jauh sesudah draf selesai.
 */
export async function readDraftState(documentId: string): Promise<DraftState> {
	try {
		const raw = await redis.get(key(documentId))
		return raw ? (JSON.parse(raw) as DraftState) : { status: 'ready' }
	} catch (error) {
		log.error({ err: error, documentId }, 'Gagal membaca status draf')
		return { status: 'ready' }
	}
}
