import { env } from '@/config/env'
import { createRouter } from '@/lib/create-app'
import { AppError } from '@/lib/error'
import { readLocalFile } from '@/lib/storage/local'

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
