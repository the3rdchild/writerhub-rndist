import { z } from 'zod'

/** Body `POST /documents/:id/versions` — snapshot manual berlabel opsional. */
export const createVersionBodySchema = z.object({
	label: z.string().max(255).nullish(),
})

export type CreateVersionBody = z.infer<typeof createVersionBodySchema>

export type VersionTrigger = 'manual' | 'interval' | 'pre_translate' | 'pre_restore'

export interface VersionSummary {
	id: string
	trigger: VersionTrigger
	label: string | null
	wordCount: number
	/** Epoch ms, konsisten dengan respons documents. */
	createdAt: number
}

export interface VersionDetail extends VersionSummary {
	content: Record<string, unknown>
}
