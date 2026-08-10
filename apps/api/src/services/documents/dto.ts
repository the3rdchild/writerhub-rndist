import { z } from 'zod'
import type { TabSummary } from '@/services/tabs/dto'

export type { TabSummary }

/**
 * Body `POST /documents`: membuat dokumen induk + satu tab awal.
 * `content`/`emoji`/`language` adalah milik TAB PERTAMA; `content` adalah
 * JSONContent dari editor Tiptap dan disimpan apa adanya di jsonb.
 */
export const createDocumentBodySchema = z.object({
	title: z.string().min(1).max(500),
	content: z.record(z.string(), z.unknown()).optional(),
	emoji: z.string().max(32).nullish(),
	language: z.string().max(32).nullish(),
	/** Proyek tujuan; harus milik user. Tidak dikirim = "Tanpa proyek". */
	projectId: z.uuid().nullish(),
})

export type CreateDocumentBody = z.infer<typeof createDocumentBodySchema>

/** Update dokumen induk: judul dan/atau keanggotaan proyek. */
export const updateDocumentBodySchema = z.object({
	title: z.string().min(1).max(500).optional(),
	// `null` berarti keluarkan dokumen dari proyeknya; field tidak dikirim
	// berarti jangan ubah keanggotaan proyek.
	projectId: z.uuid().nullish(),
})

export type UpdateDocumentBody = z.infer<typeof updateDocumentBodySchema>

/** Satu baris daftar dokumen (Library): metadata induk + jumlah tab. */
export interface DocumentSummary {
	id: string
	title: string
	projectId: string | null
	tabCount: number
	updatedAt: number
	createdAt: number
}

/** Detail dokumen induk beserta daftar tabnya, urut `position`. */
export interface DocumentDetail extends DocumentSummary {
	tabs: TabSummary[]
}
