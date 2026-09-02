import type { DraftErrorCode, DraftPhase, DraftStatus } from '@writer-hub/shared'
import redis from '@/config/redis'
import LoggerClient from '@/lib/logger'

/**
 * Status generasi draf, disimpan di Redis dan berumur pendek.
 *
 * Kenapa bukan kolom di basis data: yang perlu diingat hanyalah "isinya masih
 * ditulis" selama beberapa menit sesudah dokumen dibuat. Sesudah draf tersimpan
 * di tabnya, dokumen itu tidak berbeda dari dokumen mana pun - tidak ada yang
 * perlu diingat lagi, dan sebuah kolom permanen justru akan basi.
 *
 * Satu hal yang ditegakkan di sini: **status `generating` selalu punya batas
 * waktu.** Proses yang menulisnya berjalan di luar siklus permintaan HTTP, jadi
 * restart deployment atau proses yang mati di tengah jalan tidak akan pernah
 * sempat menandai kegagalannya. Tanpa tenggat, catatan seperti itu tinggal
 * selamanya sebagai "sedang ditulis" dan penantinya menunggu sesuatu yang sudah
 * tidak ada.
 */

const KEY_PREFIX = 'draft:status:'

/** Sisa umur catatan sesudah draf selesai; cukup untuk penerima tautan yang membukanya belakangan. */
const TTL_SECONDS = 24 * 60 * 60

const log = LoggerClient.getInstance()

export interface DraftState {
	status: DraftStatus
	phase?: DraftPhase
	characters?: number
	targetCharacters?: number
	/** Batas waktu penulisan; sesudah ini `generating` dibaca sebagai gagal. */
	deadline?: number
	error?: string
	errorCode?: DraftErrorCode
}

export interface GeneratingState {
	phase: DraftPhase
	characters: number
	targetCharacters: number
	deadline: number
}

export interface FailedState {
	code: DraftErrorCode
	message: string
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

/** Dipanggil berulang selama penulisan: setiap pergantian tahap dan setiap kemajuan. */
export function markGenerating(documentId: string, progress: GeneratingState): Promise<void> {
	return write(documentId, { status: 'generating', ...progress })
}

export function markReady(documentId: string): Promise<void> {
	return write(documentId, { status: 'ready' })
}

export function markFailed(documentId: string, { code, message }: FailedState): Promise<void> {
	return write(documentId, { status: 'failed', error: message, errorCode: code })
}

/**
 * Dokumen tanpa catatan dianggap `ready`: tidak ada generasi yang tertunda
 * untuknya - entah karena naskahnya datang siap pakai, atau karena catatannya
 * sudah kedaluwarsa jauh sesudah draf selesai.
 */
export async function readDraftState(documentId: string): Promise<DraftState> {
	let state: DraftState
	try {
		const raw = await redis.get(key(documentId))
		if (!raw) return { status: 'ready' }
		state = JSON.parse(raw) as DraftState
	} catch (error) {
		log.error({ err: error, documentId }, 'Gagal membaca status draf')
		return { status: 'ready' }
	}

	return isAbandoned(state) ? abandoned() : state
}

/**
 * Penulisan yang lewat tenggatnya tanpa pernah menandai hasilnya. Prosesnya
 * sudah tidak ada - tidak ada gunanya menunggu lebih lama.
 */
function isAbandoned(state: DraftState): boolean {
	return state.status === 'generating' && typeof state.deadline === 'number' && Date.now() > state.deadline
}

function abandoned(): DraftState {
	return {
		status: 'failed',
		errorCode: 'timeout',
		error: 'Penulisan draf berhenti di tengah jalan dan tidak dilanjutkan.',
	}
}
