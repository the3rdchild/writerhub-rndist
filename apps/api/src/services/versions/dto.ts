import { z } from 'zod'

export const createVersionBodySchema = z.object({
	label: z.string().max(255).nullish(),
	// `ai_result` ditulis jalur AI Chat sesudah aksinya diterapkan - lihat
	// docs/CHAT-TRANSCRIPT-PLAN.md §6. `interval` dan `pre_restore` tetap milik
	// server sendiri dan tidak boleh datang dari klien.
	trigger: z.enum(['manual', 'pre_translate', 'ai_result']).optional(),
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
