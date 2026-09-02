import { REWRITE_TONE_IDS } from '@writer-hub/shared'
import { z } from 'zod'

/** Cukup untuk satu permintaan "buatkan …" beserta konteksnya, bukan untuk naskah utuh. */
const MAX_PROMPT_CHARS = 8_000
/** Naskah siap pakai boleh jauh lebih panjang - ia memang sudah berupa dokumen. */
const MAX_CONTENT_CHARS = 200_000

/** Batas panjang yang boleh diminta; di bawah ini bukan dokumen, di atasnya bukan satu panggilan. */
const MIN_TARGET_WORDS = 100
const MAX_TARGET_WORDS = 5_000

/**
 * Satu badan permintaan melayani dua alur pemanggil:
 *
 * - `prompt` saja - WritingHub yang menulis drafnya lewat provider AI pengguna.
 * - `content` (Markdown) - pemanggil sudah punya naskahnya; kami hanya
 *   menjadikannya dokumen dan mengembalikan tautannya.
 *
 * Kalau keduanya dikirim, `content` menang: naskah yang sudah ada tidak perlu
 * ditulis ulang, dan `prompt` cukup jadi asal-usul judul.
 */
export const draftRequestSchema = z
	.object({
		prompt: z.string().trim().min(1).max(MAX_PROMPT_CHARS).optional(),
		content: z.string().trim().min(1).max(MAX_CONTENT_CHARS).optional(),
		title: z.string().trim().min(1).max(500).optional(),
		tone: z.enum(REWRITE_TONE_IDS).optional(),
		// Ikut masuk ke prompt, bukan cuma jadi angka pembanding: taksiran
		// kemajuan hanya jujur kalau panjangnya memang yang kami minta.
		words: z.number().int().min(MIN_TARGET_WORDS).max(MAX_TARGET_WORDS).optional(),
		language: z.string().trim().min(1).max(32).optional(),
		projectId: z.uuid().optional(),
	})
	.refine((body) => Boolean(body.prompt || body.content), {
		message: 'Butuh `prompt` (untuk ditulis WritingHub) atau `content` (Markdown siap pakai)',
	})

export type DraftRequest = z.infer<typeof draftRequestSchema>
