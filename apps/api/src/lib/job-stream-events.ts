import type { JobEvent } from './job-events'

/**
 * Bentuk payload yang dikirim ke klien lewat SSE. Semuanya murni: tidak
 * menyentuh basis data maupun Redis, sehingga bisa diuji tanpa keduanya.
 *
 * Worker memakai bentuk yang sama saat mempublikasikan ke pub/sub, jadi
 * perubahan di sini harus diikuti `services/worker`.
 */

/** Fitur yang menaruh isi hasilnya langsung di akar event, bukan di `result`. */
export const FLATTENED_RESULT_FEATURE = 'grammar'

export const JOB_FAILED_FALLBACK_MESSAGE = 'Job failed'
export const RESULT_NOT_STORED_MESSAGE = 'Hasil job tidak tersimpan karena job tidak tertaut ke tab dokumen'

export function errorEvent(message: string): JobEvent {
	return { type: 'error', message }
}

export function cancelledEvent(): JobEvent {
	return { type: 'cancelled' }
}

export function timeoutEvent(): JobEvent {
	return { type: 'timeout' }
}

/**
 * Grammar sudah lama dikonsumsi klien dengan field hasil berada di akar event,
 * sementara fitur lain membungkusnya di `result`. Perbedaan itu dipertahankan
 * di satu tempat ini supaya tidak tersebar sebagai percabangan di route.
 */
export function doneEvent(feature: string, result: Record<string, unknown>): JobEvent {
	// `type` ditulis SESUDAH pembongkaran, bukan sebelumnya. Kalau urutannya
	// dibalik, hasil worker yang kebetulan punya kunci `type` akan menggeser
	// penanda event - klien tidak pernah melihat 'done' dan menggantung sampai
	// batas waktu.
	if (feature === FLATTENED_RESULT_FEATURE) return { ...result, type: 'done' }

	return { type: 'done', result }
}

export function serializeEvent(event: JobEvent): string {
	return JSON.stringify(event)
}
