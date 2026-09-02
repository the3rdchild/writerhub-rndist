import type { TabLayout } from '@writer-hub/shared'
import { z } from 'zod'
import type { DocumentTab } from '@/db/schemas'
import type { TabSummary } from '@/services/tabs/dto'
import { tabLayoutOverrideSchema, tabLayoutSchema } from '@/services/tabs/dto'

export type { TabSummary }

export const createDocumentBodySchema = z.object({
	/** Opsional bila `templateSlug` dikirim - judul diambil dari nama template. */
	title: z.string().min(1).max(500).optional(),
	content: z.record(z.string(), z.unknown()).optional(),
	emoji: z.string().max(32).nullish(),
	language: z.string().max(32).nullish(),
	projectId: z.uuid().optional(),
	/** Template yang melahirkan dokumen; slug tidak dikenal membalas 400. */
	templateSlug: z.string().max(64).optional(),
	/** Tata letak dasar dokumen. */
	layout: tabLayoutSchema.nullish(),
	/** Penimpa tata letak untuk tab pertama. */
	tabLayout: tabLayoutOverrideSchema.nullish(),
})

export type CreateDocumentBody = z.infer<typeof createDocumentBodySchema>

export const updateDocumentBodySchema = z.object({
	title: z.string().min(1).max(500).optional(),
	projectId: z.uuid().optional(),
	layout: tabLayoutSchema.nullish(),
})

export type UpdateDocumentBody = z.infer<typeof updateDocumentBodySchema>

export interface DocumentSummary {
	id: string
	title: string
	projectId: string
	templateSlug: string | null
	layout: TabLayout | null
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
