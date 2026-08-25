import { z } from 'zod'

/**
 * Body `POST /tabs/:tabId/versions` - snapshot berlabel opsional.
 *
 * `trigger` dibatasi ke dua nilai yang memang boleh diminta klien: snapshot
 * manual, dan titik pulih otomatis sebelum terjemahan menimpa naskah.
 * `interval` dan `pre_restore` tetap milik server - klien tidak boleh mengarang
 * jejak yang bukan hasil perbuatannya.
 */
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
	/** Epoch ms, konsisten dengan respons documents. */
	createdAt: number
}

export interface VersionDetail extends VersionSummary {
	content: Record<string, unknown>
}
