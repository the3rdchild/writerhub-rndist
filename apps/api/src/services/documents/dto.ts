import { z } from 'zod'

/**
 * `content` adalah JSONContent dari editor Tiptap; backend tidak perlu memahami
 * strukturnya, cukup menyimpannya apa adanya di jsonb.
 */
export const createDocumentBodySchema = z.object({
	title: z.string().min(1).max(500),
	content: z.record(z.string(), z.unknown()),
	emoji: z.string().max(32).nullish(),
	language: z.string().max(32).nullish(),
})

export type CreateDocumentBody = z.infer<typeof createDocumentBodySchema>

/** Autosave: semua field opsional, hanya yang dikirim yang ditimpa. */
export const updateDocumentBodySchema = z.object({
	title: z.string().min(1).max(500).optional(),
	content: z.record(z.string(), z.unknown()).optional(),
	emoji: z.string().max(32).nullish(),
	language: z.string().max(32).nullish(),
})

export type UpdateDocumentBody = z.infer<typeof updateDocumentBodySchema>

export interface DocumentSummary {
	id: string
	title: string
	emoji: string | null
	language: string | null
	updatedAt: number
	createdAt: number
}

export interface DocumentDetail extends DocumentSummary {
	content: Record<string, unknown>
}
