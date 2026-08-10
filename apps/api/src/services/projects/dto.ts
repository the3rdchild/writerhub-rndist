import { z } from 'zod'

export const createProjectBodySchema = z.object({
	name: z.string().min(1).max(255),
	color: z.string().max(32).nullish(),
})

export type CreateProjectBody = z.infer<typeof createProjectBodySchema>

/** Semua field opsional, hanya yang dikirim yang ditimpa. */
export const updateProjectBodySchema = z.object({
	name: z.string().min(1).max(255).optional(),
	color: z.string().max(32).nullish(),
})

export type UpdateProjectBody = z.infer<typeof updateProjectBodySchema>

export interface ProjectSummary {
	id: string
	name: string
	color: string | null
	/**
	 * Jumlah dokumen di dalam proyek. Hanya terisi pada endpoint daftar; pada
	 * respons create/update nilainya diturunkan dari operasi itu sendiri
	 * (proyek baru = 0, ganti nama tidak mengubah isinya).
	 */
	documentCount: number
	updatedAt: number
	createdAt: number
}
