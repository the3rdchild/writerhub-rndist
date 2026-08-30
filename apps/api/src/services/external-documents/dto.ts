import { REWRITE_TONE_IDS } from '@writer-hub/shared'
import { z } from 'zod'

/**
 * Kontrak POST /api/v1/external/documents - dipakai klien eksternal (PPE AI
 * Chat) untuk meminta dokumen baru dan menerima tautan share-nya. Persis
 * salah satu dari `markdown` (konten sudah jadi) atau `prompt` (instruksi
 * bebas yang dibuatkan drafnya oleh LLM) harus diisi.
 */
export const createExternalDocumentBodySchema = z
	.object({
		title: z.string().min(1, 'Judul dokumen wajib diisi').max(500),
		markdown: z.string().min(1).max(100_000).optional(),
		prompt: z.string().min(1).max(8_000).optional(),
		tone: z.enum(REWRITE_TONE_IDS).optional(),
	})
	.refine((body) => (body.markdown === undefined) !== (body.prompt === undefined), {
		message: 'Isi tepat salah satu dari markdown atau prompt, bukan keduanya',
	})

export type CreateExternalDocumentBody = z.infer<typeof createExternalDocumentBodySchema>

export interface ExternalDocumentResponse {
	documentId: string
	title: string
	token: string
	/** URL absolut ke halaman share - langsung bisa dibuka penerima. */
	url: string
}
