import { z } from 'zod'
export const createTabBodySchema = z.object({
	title: z.string().min(1).max(500).optional(),
	content: z.record(z.string(), z.unknown()).optional(),
	emoji: z.string().max(32).nullish(),
	language: z.string().max(32).nullish(),
})

export type CreateTabBody = z.infer<typeof createTabBodySchema>
export const updateTabBodySchema = z.object({
	title: z.string().min(1).max(500).optional(),
	content: z.record(z.string(), z.unknown()).optional(),
	emoji: z.string().max(32).nullish(),
	language: z.string().max(32).nullish(),
})

export type UpdateTabBody = z.infer<typeof updateTabBodySchema>
export const reorderTabsBodySchema = z.object({
	tabIds: z.array(z.uuid()).min(1),
})

export type ReorderTabsBody = z.infer<typeof reorderTabsBodySchema>
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
export interface TabDetail extends TabSummary {
	content: Record<string, unknown>
}
