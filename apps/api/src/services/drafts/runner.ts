import LoggerClient from '@/lib/logger'
import { touchDocument, updateDocument } from '@/repository/document'
import { updateTab } from '@/repository/document-tab'
import { snapshotIntervalTab } from '@/services/tabs/service'
import { generateDraftMarkdown, type ProviderConfig } from './generation'
import { headingTitle, markdownToDoc } from './markdown-doc'
import { markFailed, markReady } from './status'

/**
 * Menyelesaikan draf sesudah balasan HTTP-nya dikirim: minta naskah ke
 * provider, simpan sebagai isi tab, lalu tandai statusnya.
 *
 * Dipisahkan dari service karena umurnya memang berbeda. Service hidup selama
 * satu permintaan - begitu tautan dikembalikan, `Context` Hono beserta
 * signal-nya sudah tidak berlaku, dan apa pun yang masih memegangnya akan ikut
 * dibatalkan. Fungsi di sini sengaja tidak tahu-menahu soal HTTP.
 */

const log = LoggerClient.getInstance()

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
}

/**
 * Sengaja tidak mengembalikan Promise: pemanggilnya adalah jalur permintaan
 * HTTP yang tidak boleh menunggu. Semua galat berakhir sebagai status `failed`
 * yang bisa dibaca lewat endpoint status, bukan sebagai rejection yang hilang.
 */
export function runDraftGeneration(input: DraftGeneration): void {
	void writeDraft(input).catch((error) => {
		log.error({ err: error, documentId: input.documentId }, 'Generasi draf gagal total')
	})
}

async function writeDraft({
	documentId,
	tabId,
	ownerId,
	createdBy,
	provider,
	messages,
	titleFromHeading,
}: DraftGeneration): Promise<void> {
	try {
		const markdown = await generateDraftMarkdown(provider, messages)
		const content = markdownToDoc(markdown)
		const title = titleFromHeading ? headingTitle(markdown) : null

		await updateTab(tabId, { content, ...(title ? { title } : {}) })
		if (title) await updateDocument(documentId, ownerId, { title })
		else await touchDocument(documentId)

		await snapshotIntervalTab(tabId, content, createdBy)
		await markReady(documentId)
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Draf gagal ditulis'
		log.error({ err: error, documentId, tabId }, 'Gagal menulis draf')
		await markFailed(documentId, message)
	}
}
