import type { DraftDownload, DraftOutput, DraftRenderError } from '@writer-hub/shared'
import { env } from '@/config/env'
import { getPresignedUrl } from '@/lib/cdn'
import LoggerClient from '@/lib/logger'
import QueueClient from '@/lib/queue'
import { signRender } from '@/lib/signed-url'
import { downloadFileName, unrenderedReason } from './output'
import { type RenderRecord, readRenderRecord, writeRenderRecord } from './render-store'

/**
 * Jembatan antara dokumen yang sudah jadi dan worker yang merendernya jadi
 * berkas: menitipkan job ke antrean, lalu menyusun bagian `downloads`/
 * `renderErrors` dari catatannya saat statusnya ditanya.
 *
 * Penulisannya dan perendernya memang berurusan di sini sekali saja: setelah
 * job dibuat, apps/api tidak tahu kapan ia jalan - ia hanya membaca hasilnya.
 * Kalau penulisan dan render diikat jadi satu job, Chromium menganggur satu
 * setengah menit menunggu model mengetik; dipisah, dua peramban melayani
 * belasan permintaan per menit (docs/RENDER-WORKER-PLAN.md §2).
 */

const log = LoggerClient.getInstance()

/**
 * Umur terpanjang yang masih masuk akal untuk satu job: antrean penuh **plus**
 * satu render, dengan kelonggaran satu menit.
 *
 * Dipakai dua kali, dan memang harus angka yang sama. Ia umur token halaman
 * ekspor - `RENDER_TOKEN_TTL_SECONDS` hanya menutup satu kunjungan interaktif,
 * jadi token seumur itu bisa mati di tengah antrean dan menghasilkan render
 * yang pasti gagal karena alasan yang tak terlihat dari luar. Ia juga batas
 * kesabaran pembaca status: lewat dari sini, catatan yang masih `queued`
 * bukan pekerjaan yang berjalan lambat, melainkan worker yang tidak pernah
 * mengambilnya.
 */
function jobLifetimeSeconds(): number {
	return env.RENDER_QUEUE_TIMEOUT_S + env.RENDER_PAGE_TIMEOUT_S + 60
}

/**
 * Alasan untuk job yang catatannya tidak pernah ditutup worker - ia mati di
 * tengah render, atau tidak pernah mengambilnya sama sekali.
 */
const STALLED =
	'Render berkasnya tidak selesai dan sudah lewat batas waktunya. Dokumennya tetap utuh - buka di WritingHub dan cetak dari sana, atau minta ulang dokumennya.'

/**
 * Menitipkan satu dokumen ke antrean render, beserta token halaman ekspornya
 * yang berumur {@link jobLifetimeSeconds}.
 */
export async function enqueueDraftRender(documentId: string, outputs: readonly DraftOutput[]): Promise<void> {
	if (!outputs.length) return

	const requested = [...outputs]

	try {
		const { exp, sig } = signRender(documentId, jobLifetimeSeconds())
		await writeRenderRecord(documentId, { status: 'queued', outputs: requested })
		await QueueClient.enqueueRenderJob(documentId, {
			documentId,
			outputs: requested,
			exp,
			sig,
			enqueuedAt: Math.floor(Date.now() / 1000),
		})
	} catch (error) {
		log.error({ err: error, documentId }, 'Gagal menitipkan job render draf')

		/*
		 * Catatan `queued` tanpa job di antreannya akan menggantung selamanya
		 * di mata penanya status. Ditutup di sini dengan hasil kosong supaya
		 * jawabannya tetap jujur: dokumennya siap, berkasnya tidak jadi.
		 */
		await writeRenderRecord(documentId, {
			status: 'done',
			outputs: requested,
			downloads: [],
			errors: requested.map((output) => ({ output, reason: unrenderedReason(output) })),
		})
	}
}

/** Bagian serah-terima yang berasal dari render, digabung oleh `toHandoff`. */
export interface RenderHandoffPart {
	status?: 'queued' | 'rendering'
	downloads?: DraftDownload[]
	renderErrors?: DraftRenderError[]
}

/**
 * Membaca catatan render dan menyusun `downloads` beserta `renderErrors`.
 *
 * URL unduh diterbitkan di sini, setiap kali ditanya, supaya umurnya dihitung
 * dari saat itu - bukan dari saat dokumennya dirender. Catatan tanpa hasil
 * (Redis kosong, misalnya) diberi tahu apa adanya alih-alih didiamkan: medan
 * yang hilang diam-diam adalah teka-teki bagi pemanggil yang sudah menulis
 * penanganannya.
 */
export async function renderHandoff(
	documentId: string,
	title: string,
	outputs: readonly DraftOutput[],
): Promise<RenderHandoffPart> {
	if (!outputs.length) return {}

	const record = await readRenderRecord(documentId)
	if (!record) {
		return {
			downloads: [],
			renderErrors: outputs.map((output) => ({ output, reason: unrenderedReason(output) })),
		}
	}

	if (record.status !== 'done') {
		if (isStalled(record)) {
			log.warn({ documentId, status: record.status }, 'Catatan render menggantung lewat batas waktunya')
			return { downloads: [], renderErrors: outputs.map((output) => ({ output, reason: STALLED })) }
		}

		// Sengaja tanpa `renderErrors`: belum ada yang gagal, hanya belum jadi.
		return { status: record.status, downloads: [] }
	}

	const downloads = await Promise.all(
		(record.downloads ?? []).map(async (entry) => {
			const url = await getPresignedUrl(entry.key, env.EXPORT_URL_TTL_S, {
				downloadFilename: downloadFileName(title, entry.output),
			})

			return {
				output: entry.output,
				url,
				expiresAt: Math.floor(Date.now() / 1000) + env.EXPORT_URL_TTL_S,
				...(entry.page !== undefined ? { page: entry.page } : {}),
			} satisfies DraftDownload
		}),
	)

	return { downloads, renderErrors: renderErrorsOf(record, outputs) }
}

/**
 * Catatan yang masih berjalan padahal umurnya sudah lewat.
 *
 * Catatan tanpa `at` datang dari worker versi lama; ia dianggap masih hidup -
 * menebaknya mati akan mengubur hasil yang sebenarnya sedang dikerjakan.
 */
function isStalled(record: RenderRecord): boolean {
	if (typeof record.at !== 'number') return false
	return Math.floor(Date.now() / 1000) - record.at > jobLifetimeSeconds()
}

/**
 * Keluaran yang diminta tapi tidak ada di `downloads`, dengan alasannya.
 *
 * Alasan yang tercatat menang; yang lain berarti formatnya memang belum
 * punya perender - atau hasilnya hilang tanpa jejak, dan keduanya perlu
 * dibedakan oleh yang membaca.
 */
export function renderErrorsOf(record: RenderRecord, outputs: readonly DraftOutput[]): DraftRenderError[] {
	const delivered = new Set((record.downloads ?? []).map((entry) => entry.output))
	const recorded = new Map((record.errors ?? []).map((error) => [error.output, error.reason]))

	return outputs
		.filter((output) => !delivered.has(output))
		.map((output) => ({ output, reason: recorded.get(output) ?? unrenderedReason(output) }))
}
