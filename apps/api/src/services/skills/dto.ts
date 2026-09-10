import { z } from 'zod'

/**
 * `name` dan `file` tidak divalidasi bentuknya di sini, melainkan dicocokkan
 * ke katalog oleh `skillFilePath`. Batas panjangnya semata-mata supaya
 * permintaan ngawur tidak sampai ke sana.
 */
export const skillReadSchema = z.object({
	name: z.string().min(1).max(80),
	file: z.string().min(1).max(80).optional(),
})

export type SkillReadBody = z.infer<typeof skillReadSchema>
