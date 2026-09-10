import { findActiveSkill } from '@writer-hub/shared'
import { z } from 'zod'

/**
 * Tipe diagram diambil dari katalog skill, bukan didaftar ulang di sini.
 *
 * Dua daftar yang perlu dijaga sejajar akan berpisah pada penambahan tipe
 * pertama yang lupa disalin - dan gejalanya adalah tipe yang diterima rute lalu
 * gagal saat berkas tata bahasanya dicari.
 */
const TYPES = findActiveSkill('diagram-design')?.files.map((file) => file.name) ?? []

export const diagramDrawSchema = z.object({
	type: z.enum(TYPES as [string, ...string[]]),
	/**
	 * Yang harus digambar, dalam bahasa manusia. Sub-agent tidak pernah melihat
	 * dokumennya, jadi inilah satu-satunya sumbernya - dan itu sebabnya ia
	 * dibatasi panjang, bukan dibatasi bentuk.
	 */
	spec: z.string().min(1).max(4000),
	/** Diagram yang akan ditanam di rancangan gelap. Terang adalah bakunya. */
	dark: z.boolean().optional(),
	/** Sumber yang sedang direvisi, kalau ini permintaan gambar ulang. */
	previous: z.string().max(200_000).optional(),
	model: z.string().max(200).optional(),
})

export type DiagramDrawBody = z.infer<typeof diagramDrawSchema>
