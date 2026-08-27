import { z } from 'zod'

export const createProjectBodySchema = z.object({
	name: z.string().min(1).max(255),
	color: z.string().max(32).nullish(),
})

export type CreateProjectBody = z.infer<typeof createProjectBodySchema>

export const updateProjectBodySchema = z.object({
	name: z.string().min(1).max(255).optional(),
	color: z.string().max(32).nullish(),
})

export type UpdateProjectBody = z.infer<typeof updateProjectBodySchema>

export interface ProjectSummary {
	id: string
	name: string
	color: string | null
	documentCount: number
	updatedAt: number
	createdAt: number
}
