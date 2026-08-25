import { z } from 'zod'
export const createVersionBodySchema = z.object({
	label: z.string().max(255).nullish(),
	trigger: z.enum(['manual', 'pre_translate']).optional(),
})

export type CreateVersionBody = z.infer<typeof createVersionBodySchema>

export type VersionTrigger = 'manual' | 'interval' | 'pre_translate' | 'pre_restore' | 'ai_result'

export interface VersionSummary {
	id: string
	trigger: VersionTrigger
	label: string | null
	wordCount: number
	createdAt: number
	feature: string | null
}

export interface VersionDetail extends VersionSummary {
	content: Record<string, unknown>
}
