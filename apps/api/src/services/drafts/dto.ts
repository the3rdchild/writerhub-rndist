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
		/**
		 * Bentuk naskah yang diminta.
		 *
		 * `document` menghasilkan prosa Markdown - itu yang selalu terjadi
		 * sebelumnya, apa pun yang tertulis di `prompt`. Permintaan "buatkan
		 * flyer" pun keluar sebagai dokumen berjudul dan berparagraf, karena
		 * satu-satunya bentuk yang dikenal jalur ini adalah dokumen.
		 *
		 * `flyer` menghasilkan satu rancangan HTML mandiri yang mengisi satu
		 * halaman penuh - flyer, poster, one-pager, sertifikat, undangan.
		 *
		 * `auto` (bawaan) menyerahkan pilihannya ke model berdasarkan
		 * permintaannya sendiri. Ia dipilih sebagai bawaan karena pemanggil
		 * eksternal sering hanya meneruskan kalimat penggunanya apa adanya, dan
		 * tidak punya tempat untuk menyatakan bentuk yang diinginkan.
		 */
		kind: z.enum(['auto', 'document', 'flyer']).optional(),
		/**
		 * Model yang diminta. Aturannya sama persis dengan AI Chat
		 * (`lib/pick-model.ts`): hanya dihormati kalau ia model yang dikenal dan
		 * sambungannya memang bisa diarahkan per permintaan. Tanpa ini, jalur
		 * draf memakai model bawaan penggunanya - yang juga bawaan AI Chat.
		 */
		model: z.string().trim().max(200).optional(),
		projectId: z.uuid().optional(),
		/** Template yang melahirkan dokumen; aturan formatnya ikut ke prompt penulisan. */
		templateSlug: z.string().trim().min(1).max(64).optional(),
	})
	.refine((body) => Boolean(body.prompt || body.content), {
		message: 'Butuh `prompt` (untuk ditulis WritingHub) atau `content` (Markdown siap pakai)',
	})

export type DraftRequest = z.infer<typeof draftRequestSchema>
