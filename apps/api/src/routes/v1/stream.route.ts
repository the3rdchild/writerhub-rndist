import { streamSSE } from 'hono/streaming'
import { createRouter } from '@/lib/create-app'
import { isTerminalEvent, subscribeToJob } from '@/lib/job-events'
import { findMetadataVersion, findPoolRequest } from '@/repository/job-result'

const HEARTBEAT_INTERVAL_MS = 8_000
const STREAM_TIMEOUT_MS = 180_000

/**
 * Endpoint SSE ini sengaja tidak memakai `authMiddleware`: browser tidak bisa
 * mengirim header kustom lewat EventSource, dan klien ekstensi berlangganan
 * langsung ke sini. Perlindungannya adalah jobId berupa UUID acak yang hanya
 * diketahui pemilik job. apps/web mengaksesnya lewat proxy Next yang sudah
 * terautentikasi (lihat apps/web/app/api/stream/[jobId]/route.ts).
 */
const stream = createRouter().basePath('/stream')

/**
 * Snapshot hasil job yang sudah selesai sebelum SSE sempat tersambung -
 * tanpa ini, job yang rampung lebih cepat dari koneksi klien akan menggantung.
 */
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

	const row = await findMetadataVersion(jobId).catch(() => null)
	if (!row) return null

	// Bentuk respons dipertahankan sama seperti sebelum penggabungan ke
	// metadata_version: grammar di-flatten dari `result`, feature lain
	// dibungkus `{ result }` seperti analysis_result dulu.
	if (row.feature === 'grammar') {
		return JSON.stringify({ type: 'done', ...row.result })
	}
	return JSON.stringify({ type: 'done', result: row.result })
}

stream.get('/:jobId', async (c) => {
	const jobId = c.req.param('jobId')

	return streamSSE(c, async (sse) => {
		const settled = await buildSettledEvent(jobId)
		if (settled) {
			await sse.writeSSE({ data: settled })
			return
		}

		let finish = () => {}

		// Callback streamSSE harus tetap hidup selama stream terbuka: Hono menutup
		// koneksi begitu promise ini selesai.
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

		const unsubscribe = await subscribeToJob(jobId, (raw) => void forward(raw))

		const heartbeat = setInterval(() => {
			sse.writeSSE({ event: 'ping', data: 'ok' }).catch(() => finish())
		}, HEARTBEAT_INTERVAL_MS)

		const timeout = setTimeout(async () => {
			await sse.writeSSE({ data: JSON.stringify({ type: 'timeout' }) }).catch(() => undefined)
			finish()
		}, STREAM_TIMEOUT_MS)

		sse.onAbort(() => finish())

		try {
			await closed
		} finally {
			clearInterval(heartbeat)
			clearTimeout(timeout)
			unsubscribe()
		}
	})
})

export default stream
