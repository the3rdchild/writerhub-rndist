import { streamSSE } from 'hono/streaming'
import { createRouter } from '@/lib/create-app'
import { isTerminalEvent, subscribeToJob } from '@/lib/job-events'
import { findMetadataVersion, findPoolRequest } from '@/repository/job-result'

const HEARTBEAT_INTERVAL_MS = 8_000
const STREAM_TIMEOUT_MS = 180_000
const stream = createRouter().basePath('/stream')
async function buildSettledEvent(jobId: string): Promise<string | null> {
	const request = await findPoolRequest(jobId).catch(() => null)
	if (!request) return null

	if (request.status === 'failed') {
		return JSON.stringify({ type: 'error', message: request.error ?? 'Job failed' })
	}
	if (request.status === 'cancelled') {
		return JSON.stringify({ type: 'cancelled' })
	}
	if (request.status !== 'completed') return null

	// Worker menyimpan metadata_version SEBELUM menandai completed, jadi baris
	// yang hilang di sini bukan balapan: hasilnya memang tidak tersimpan karena
	// job tidak tertaut tab (lihat save_metadata_version di worker). Balas error
	// alih-alih null - null membuat klien menunggu event yang tidak akan datang.
	const row = await findMetadataVersion(jobId).catch(() => null)
	if (!row) {
		return JSON.stringify({
			type: 'error',
			message: 'Hasil job tidak tersimpan karena job tidak tertaut ke tab dokumen',
		})
	}
	if (row.feature === 'grammar') {
		return JSON.stringify({ type: 'done', ...row.result })
	}
	return JSON.stringify({ type: 'done', result: row.result })
}

stream.get('/:jobId', async (c) => {
	const jobId = c.req.param('jobId')

	return streamSSE(c, async (sse) => {
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
			await sse.writeSSE({ data: JSON.stringify({ type: 'timeout' }) }).catch(() => undefined)
			finish()
		}, STREAM_TIMEOUT_MS)

		sse.onAbort(() => finish())

		try {
			const settled = await buildSettledEvent(jobId)
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
	})
})

export default stream
