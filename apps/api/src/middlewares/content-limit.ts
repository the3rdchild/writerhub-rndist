import { bodyLimit } from 'hono/body-limit'
import { env } from '@/config/env'

/**
 * Batas ukuran badan untuk rute yang membawa naskah: buat dokumen, buat tab,
 * dan simpan tab (`CONTENT_MAX_MB`).
 *
 * Tanpa batas ini, naskah 20,8 MB diterima pada uji beban 30 Sep, dan Bun
 * menerima sampai 128 MB. Setiap simpanan juga bisa menjadi snapshot versi,
 * jadi satu naskah raksasa ikut tersalin berkali-kali.
 *
 * Dipasang sebelum autentikasi supaya unggahan raksasa ditolak sebelum ada
 * kerja apa pun. Pesannya ditujukan ke penulis, karena web menampilkannya.
 */
export const contentBodyLimit = bodyLimit({
	maxSize: env.CONTENT_MAX_MB * 1024 * 1024,
	onError: (c) =>
		c.json(
			{
				message: 'Manuscript too large',
				errors: [
					`The manuscript exceeds the ${env.CONTENT_MAX_MB} MB limit. Shrink or remove some images so it can be saved.`,
				],
			},
			413,
		),
})
