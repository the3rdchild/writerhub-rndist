import type { TabLayout } from '@writer-hub/shared'
import LoggerClient from '@/lib/logger'
import { touchDocument, updateDocument } from '@/repository/document'
import { updateTab } from '@/repository/document-tab'
import { snapshotIntervalTab } from '@/services/tabs/service'
import type { SectionColumns } from '@/services/templates/section-columns'
import { withColumnsAfterTitle } from '@/services/templates/section-columns'
import { toDraftFailure } from './failure'
import { generateDraftMarkdown, type ProviderConfig } from './generation'
import { headingTitle, markdownToDoc } from './markdown-doc'
import { targetCharacters } from './progress'
import { markFailed, markGenerating, markReady } from './status'

/**
 * Menyelesaikan draf sesudah balasan HTTP-nya dikirim: minta naskah ke
 * provider, simpan sebagai isi tab, lalu tandai statusnya.
 *
 * Dipisahkan dari service karena umurnya memang berbeda. Service hidup selama
 * satu permintaan - begitu tautan dikembalikan, `Context` Hono beserta
 * signal-nya sudah tidak berlaku, dan apa pun yang masih memegangnya akan ikut
 * dibatalkan. Fungsi di sini sengaja tidak tahu-menahu soal HTTP.
 *
 * Karena tidak ada pemanggil yang menunggu, **tidak ada satu jalur pun yang
 * boleh berakhir tanpa menandai status.** Setiap keluar dari fungsi ini
 * meninggalkan `ready` atau `failed`; kalau prosesnya sendiri yang mati, tenggat
 * di catatan status yang menutupnya (lihat `status.ts`).
 */

const log = LoggerClient.getInstance()

/**
 * Batas hidup satu penulisan draf. Sedikit lebih longgar dari batas waktu
 * permintaan ke provider, supaya konversi dan penyimpanan naskah yang datang
 * di detik terakhir tidak ikut dianggap terbengkalai.
 */
export const DRAFT_DEADLINE_MS = 6 * 60_000

/** Jeda minimum antar pencatatan kemajuan - tanpa ini setiap token menulis ke Redis. */
const PROGRESS_INTERVAL_MS = 1_500

export interface DraftGeneration {
	documentId: string
	tabId: string
	/** Identity pemilik dokumen - dipakai untuk menulis ulang judulnya. */
	ownerId: string
	/** User id pemanggil, dicatat sebagai pembuat versi pertama. */
	createdBy: string
	provider: ProviderConfig
	messages: Array<{ role: string; content: string }>
	/** Judul boleh diambil dari heading pertama karena pemanggil tidak menentukannya. */
	titleFromHeading: boolean
	/**
	 * Kolom badan naskah dari template asal. Kontennya ditulis ulang utuh,
	 * jadi pembatas section pembawanya harus disisipkan lagi sesudah naskah
	 * jadi - tanpa ini draf paper IEEE keluar satu kolom.
	 */
	columns?: SectionColumns
	/** Panjang yang diminta pemanggil; dasar taksiran kemajuan. */
	words?: number
	/**
	 * Izin menjadikan jawaban satu-pagar-html sebagai blok rancangan. Ikut ke
	 * sini dan tidak disimpulkan ulang dari prompt: yang menentukan bentuk
	 * naskah adalah permintaannya, dan permintaan itu hanya ada di service.
	 */
	allowHtmlBlock?: boolean
	/**
	 * Lembar untuk rancangan satu halaman, dibaca dari permintaannya
	 * (`design-layout.ts`). Dipakai HANYA kalau jawaban model ternyata benar
	 * sebuah rancangan - dokumen prosa tetap memakai lembar template atau
	 * bawaannya.
	 */
	designLayout?: TabLayout
}

/**
 * Menandai draf sebagai sedang ditulis, lalu melanjutkan di latar belakang.
 *
 * Penandaannya ditunggu, penulisannya tidak: begitu fungsi ini selesai, status
 * `generating` sudah bisa dibaca siapa pun yang membuka tautannya - termasuk
 * pemanggil yang langsung menanyakannya di milidetik berikutnya.
 */
export async function startDraftGeneration(input: DraftGeneration): Promise<void> {
	const deadline = Date.now() + DRAFT_DEADLINE_MS
	const target = targetCharacters(input.words)

	await markGenerating(input.documentId, {
		phase: 'preparing',
		characters: 0,
		targetCharacters: target,
		deadline,
	})

	void writeDraft(input, target, deadline).catch((error) => {
		log.error({ err: error, documentId: input.documentId }, 'Generasi draf gagal total')
	})
}

async function writeDraft(
	{
		documentId,
		tabId,
		ownerId,
		createdBy,
		provider,
		messages,
		titleFromHeading,
		columns,
		allowHtmlBlock,
		designLayout,
	}: DraftGeneration,
	targetCharacters: number,
	deadline: number,
): Promise<void> {
	const progress = (phase: 'writing' | 'saving', characters: number) =>
		markGenerating(documentId, { phase, characters, targetCharacters, deadline })

	let markdown: string
	try {
		markdown = await generateDraftMarkdown(provider, messages, throttled(progress))
	} catch (error) {
		const failure = toDraftFailure(error)
		log.error({ err: error, documentId, code: failure.code }, 'Provider gagal menulis draf')
		await markFailed(documentId, { code: failure.code, message: failure.message })
		return
	}

	try {
		await progress('saving', markdown.length)

		const generated = markdownToDoc(markdown, { allowHtmlBlock })
		/*
		 * Rancangan satu halaman tidak punya badan naskah untuk dikolomkan - ia
		 * satu blok yang mengisi seluruh lembar. Memasang pembatas section di
		 * atasnya hanya mendorongnya ke halaman kedua.
		 */
		const isDesign = generated.content.length === 1 && generated.content[0].type === 'htmlBlock'
		const content = columns && !isDesign ? withColumnsAfterTitle(generated, columns) : generated
		const title = titleFromHeading ? headingTitle(markdown) : null

		await updateTab(tabId, { content, ...(title ? { title } : {}) })
		/*
		 * Lembarnya baru bisa ditentukan sekarang: pada `kind: 'auto'` bentuk
		 * jawaban belum diketahui saat dokumen dibuat. Dokumen prosa tidak
		 * disentuh - lembar template yang sudah dipasang di sana harus bertahan.
		 */
		const patch = {
			...(title ? { title } : {}),
			...(isDesign && designLayout ? { layout: designLayout } : {}),
		}
		if (Object.keys(patch).length > 0) await updateDocument(documentId, ownerId, patch)
		else await touchDocument(documentId)

		await snapshotIntervalTab(tabId, content, createdBy)
		await markReady(documentId)
	} catch (error) {
		log.error({ err: error, documentId, tabId }, 'Naskah draf gagal disimpan')
		await markFailed(documentId, {
			code: 'save_failed',
			message: 'Naskahnya selesai ditulis tapi gagal disimpan ke dokumen.',
		})
	}
}

/**
 * Kemajuan dilaporkan per potongan naskah - beberapa puluh kali per detik pada
 * provider yang cepat. Yang membacanya hanya halaman penantian yang menanyakan
 * status tiap dua detik, jadi menulis lebih sering dari itu murni beban Redis.
 */
function throttled(report: (phase: 'writing', characters: number) => Promise<void>): (n: number) => void {
	let last = 0

	return (characters: number) => {
		const now = Date.now()
		if (now - last < PROGRESS_INTERVAL_MS) return
		last = now
		void report('writing', characters)
	}
}
