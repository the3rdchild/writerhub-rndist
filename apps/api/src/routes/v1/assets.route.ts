import { createRouter } from '@/lib/create-app'
import { authMiddleware } from '@/middlewares/auth'
import AssetsService from '@/services/assets/service'

const assets = createRouter().basePath('/assets')

assets.post('/', authMiddleware, (c) => new AssetsService(c).upload())
assets.get('/', authMiddleware, (c) => new AssetsService(c).list())
assets.put('/links', authMiddleware, (c) => new AssetsService(c).setLinks())
assets.delete('/:id', authMiddleware, (c) => new AssetsService(c).remove())

/*
 * Tiga endpoint berikut sengaja TANPA authMiddleware, dan masing-masing punya
 * izinnya sendiri di dalam service:
 *
 * - `urls` dan `inline` melayani dua jenis peminta - pemilik proyek lewat sesi,
 *   dan pemegang share link lewat token. Middleware yang menuntut sesi akan
 *   menutup yang kedua.
 * - `raw` dipanggil bingkai blok HTML, yang berasal-opaque dan karena itu tidak
 *   pernah mengirim cookie. Tanda tangan pada URL-nya yang menjadi izin.
 */
assets.post('/urls', (c) => new AssetsService(c).mintUrls())
assets.get('/:id/inline', (c) => new AssetsService(c).inline())
assets.get('/:id/raw', (c) => new AssetsService(c).raw())

export default assets
