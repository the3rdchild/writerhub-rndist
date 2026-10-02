import { z } from 'zod'

export const createVersionBodySchema = z.object({
	label: z.string().max(255).nullish(),
	// `ai_result` ditulis jalur AI Chat sesudah aksinya diterapkan.
	// `interval` dan `pre_restore` tetap milik server sendiri dan tidak boleh
	// datang dari klien.
	trigger: z.enum(['manual', 'pre_translate', 'ai_result']).optional(),
	/**
	 * Isi versi dari klien, bukan isi tab di server. Dipakai kolaborasi saat
	 * salinan lokal sebuah tab harus dibuang (state di server di-reset): isinya
	 * disimpan sebagai versi supaya suntingan yang belum tersinkron tidak hilang
	 * diam-diam. Tanpa ini versinya memotret isi tab saat ini.
	 */
	content: z.record(z.string(), z.unknown()).optional(),
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
