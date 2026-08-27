import type { SSEStreamingApi } from 'hono/streaming'
import { findMetadataVersion, findPoolRequest } from '@/repository/job-result'
import { isTerminalEvent, subscribeToJob } from './job-events'
import {
	cancelledEvent,
	doneEvent,
	errorEvent,
	JOB_FAILED_FALLBACK_MESSAGE,
	RESULT_NOT_STORED_MESSAGE,
	serializeEvent,
	timeoutEvent,
} from './job-stream-events'

export const HEARTBEAT_INTERVAL_MS = 8_000
export const STREAM_TIMEOUT_MS = 180_000

/**
 * Event akhir untuk job yang sudah selesai sebelum klien sempat berlangganan.
 * Mengembalikan null kalau job masih berjalan - artinya jawabannya harus
 * ditunggu dari pub/sub, bukan dari basis data.
 */
export async function readSettledEvent(jobId: string): Promise<string | null> {
	const request = await findPoolRequest(jobId).catch(() => null)
	if (!request) return null

	if (request.status === 'failed') {
		return serializeEvent(errorEvent(request.error ?? JOB_FAILED_FALLBACK_MESSAGE))
	}
	if (request.status === 'cancelled') return serializeEvent(cancelledEvent())
	if (request.status !== 'completed') return null

	// Worker menyimpan metadata_version SEBELUM menandai completed, jadi baris
	// yang hilang di sini bukan balapan: hasilnya memang tidak tersimpan karena
	// job tidak tertaut tab (lihat save_metadata_version di worker). Balas error
	// alih-alih null - null membuat klien menunggu event yang tidak akan datang.
	const row = await findMetadataVersion(jobId).catch(() => null)
	if (!row) return serializeEvent(errorEvent(RESULT_NOT_STORED_MESSAGE))

	return serializeEvent(doneEvent(row.feature, row.result))
}

/**
 * Menyalurkan seluruh masa hidup satu job ke koneksi SSE: keadaan tersimpan
 * kalau sudah selesai, atau aliran pub/sub kalau masih berjalan, ditemani
 * heartbeat dan batas waktu.
 */
export async function pipeJobStream(sse: SSEStreamingApi, jobId: string): Promise<void> {
	let finish = () => {}
	const closed = new Promise<void>((resolve) => {
		finish = resolve
	})

	const forward = async (raw: string) => {
		try {
			await sse.writeSSE({ data: raw })
			if (isTerminalEvent(JSON.parse(raw))) finish()
		} catch {
			finish()
		}
	}

	// Berlangganan DULU, baru baca keadaan tersimpan. Kalau urutannya dibalik,
	// job yang selesai tepat di antara kedua langkah tidak terbaca di basis data
	// dan event pub/sub-nya lewat begitu saja - klien menggantung sampai timeout.
	// Event yang masuk sebelum pembacaan selesai ditahan dulu di `pending`.
	let live = false
	const pending: string[] = []
	const unsubscribe = await subscribeToJob(jobId, (raw) => {
		if (live) void forward(raw)
		else pending.push(raw)
	})

	const heartbeat = setInterval(() => {
		sse.writeSSE({ event: 'ping', data: 'ok' }).catch(() => finish())
	}, HEARTBEAT_INTERVAL_MS)

	const timeout = setTimeout(async () => {
		await sse.writeSSE({ data: serializeEvent(timeoutEvent()) }).catch(() => undefined)
		finish()
	}, STREAM_TIMEOUT_MS)

	sse.onAbort(() => finish())

	try {
		const settled = await readSettledEvent(jobId)
		if (settled) {
			await sse.writeSSE({ data: settled })
			return
		}

		live = true
		for (const raw of pending) await forward(raw)
		pending.length = 0

		await closed
	} finally {
		clearInterval(heartbeat)
		clearTimeout(timeout)
		unsubscribe()
	}
}
