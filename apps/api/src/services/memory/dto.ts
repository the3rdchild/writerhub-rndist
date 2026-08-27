import { z } from 'zod'

export const memoryPreferencesSchema = z.object({
	tone: z.string().max(255).optional(),
	language: z.string().max(100).optional(),
	glossary: z.array(z.string().min(1).max(100)).max(100).optional(),
	notes: z.string().max(500).optional(),
})

export type MemoryPreferences = z.infer<typeof memoryPreferencesSchema>
