import { z } from 'zod'

/**
 * Body `POST /documents/:id/tabs`: tab baru di dalam dokumen induk.
 * `content` adalah JSONContent dari editor Tiptap; backend tidak perlu memahami
 * strukturnya, cukup menyimpannya apa adanya di jsonb.
 */
export const createTabBodySchema = z.object({
	title: z.string().min(1).max(500).optional(),
	content: z.record(z.string(), z.unknown()).optional(),
	emoji: z.string().max(32).nullish(),
	language: z.string().max(32).nullish(),
})

export type CreateTabBody = z.infer<typeof createTabBodySchema>

/** Autosave tab (`PUT /tabs/:tabId`): semua field opsional, hanya yang
 * dikirim yang ditimpa. Ini pengganti `PUT /documents/:id` lama. */
export const updateTabBodySchema = z.object({
	title: z.string().min(1).max(500).optional(),
	content: z.record(z.string(), z.unknown()).optional(),
	emoji: z.string().max(32).nullish(),
	language: z.string().max(32).nullish(),
})

export type UpdateTabBody = z.infer<typeof updateTabBodySchema>

/** Body `POST /documents/:id/tabs/reorder`: urutan baru, kiri ke kanan.
 * Harus memuat SELURUH tab dokumen tepat sekali. */
export const reorderTabsBodySchema = z.object({
	tabIds: z.array(z.uuid()).min(1),
})

export type ReorderTabsBody = z.infer<typeof reorderTabsBodySchema>

/** Ringkasan satu tab (tanpa konten), untuk daftar tab sebuah dokumen. */
export interface TabSummary {
	id: string
	documentId: string
	title: string
	emoji: string | null
	language: string | null
	position: number
	updatedAt: number
	createdAt: number
}

/** Detail satu tab beserta kontennya. */
export interface TabDetail extends TabSummary {
	content: Record<string, unknown>
}
