import { z } from 'zod'
import type { DocumentTab } from '@/db/schemas'
import type { TabSummary } from '@/services/tabs/dto'

export type { TabSummary }

export const createDocumentBodySchema = z.object({
	title: z.string().min(1).max(500),
	content: z.record(z.string(), z.unknown()).optional(),
	emoji: z.string().max(32).nullish(),
	language: z.string().max(32).nullish(),
	projectId: z.uuid().optional(),
})

export type CreateDocumentBody = z.infer<typeof createDocumentBodySchema>

export const updateDocumentBodySchema = z.object({
	title: z.string().min(1).max(500).optional(),
	projectId: z.uuid().optional(),
})

export type UpdateDocumentBody = z.infer<typeof updateDocumentBodySchema>

export interface DocumentSummary {
	id: string
	title: string
	projectId: string
	tabCount: number
	updatedAt: number
	createdAt: number
}

export interface DocumentDetail extends DocumentSummary {
	tabs: TabSummary[]
}

/**
 * Baris tab apa adanya dari basis data, sebagaimana dipakai saat menyusun
 * DocumentDetail. `content` dikecualikan karena ringkasan tab tidak pernah
 * membacanya - menyertakannya hanya membuat naskah utuh ikut terbawa untuk
 * kemudian diabaikan.
 */
export type TabRow = Omit<DocumentTab, 'content'>
