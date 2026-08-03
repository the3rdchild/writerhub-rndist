import { env } from '@/config/env'
import { createRouter } from '@/lib/create-app'
import { AppError } from '@/lib/error'
import { readLocalFile } from '@/lib/storage/local'

/**
 * Penyaji dokumen untuk driver penyimpanan `local`.
 *
 * Worker mengunduh dokumen lewat URL (sama seperti presigned URL pada driver
 * S3), jadi berkas di disk perlu satu endpoint HTTP. Rute ini hanya aktif saat
 * `STORAGE_DRIVER=local` dan tidak diproteksi `authMiddleware` — sama seperti
 * presigned URL, key acak berbasis UUID yang menjadi pengamannya.
 */
const files = createRouter().basePath('/files')

files.get('/*', async (c) => {
	if (env.STORAGE_DRIVER !== 'local') {
		throw AppError.notFound('Penyimpanan lokal tidak aktif')
	}

	const key = decodeURIComponent(c.req.path.split('/api/v1/files/')[1] ?? '')
	if (!key) throw AppError.badRequest('Key berkas kosong')

	const { file, size } = await readLocalFile(key)

	return new Response(file.stream(), {
		headers: {
			'content-type': file.type || 'application/octet-stream',
			'content-length': String(size),
			'cache-control': 'private, max-age=3600',
		},
	})
})

export default files
