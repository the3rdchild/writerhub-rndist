import { z } from 'zod'

/**
 * Preferensi gaya AI Memory - hanya empat field ini, sesuai §H.1 rencana.
 * Semuanya opsional; field yang tak dikirim berarti "tidak ada preferensi".
 * `notes` dibatasi 500 karakter sesuai spesifikasi.
 */
export const memoryPreferencesSchema = z.object({
	tone: z.string().max(255).optional(),
	language: z.string().max(100).optional(),
	glossary: z.array(z.string().min(1).max(100)).max(100).optional(),
	notes: z.string().max(500).optional(),
})

export type MemoryPreferences = z.infer<typeof memoryPreferencesSchema>
