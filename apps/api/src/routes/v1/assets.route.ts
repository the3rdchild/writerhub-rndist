import { createRouter } from '@/lib/create-app'
import { authMiddleware } from '@/middlewares/auth'
import AssetsService from '@/services/assets/service'

const assets = createRouter().basePath('/assets')

/*
 * Setiap rute yang izinnya datang dari SESI wajib memakai `authMiddleware` -
 * middleware itulah yang mengisi identitas di context. Rute tanpanya tidak
 * pernah punya sesi untuk dibaca, dan cabang sesinya mati diam-diam: permintaan
 * yang sah dibalas "User tidak dikenal", bukan galat yang menunjuk sebabnya.
 *
 * Itulah kenapa jalur share link punya rutenya sendiri di bawah alih-alih
 * menumpang lewat medan opsional. Satu rute yang mencoba melayani keduanya
 * berakhir hanya melayani yang tanpa sesi.
 */
assets.post('/', authMiddleware, (c) => new AssetsService(c).upload())
assets.get('/', authMiddleware, (c) => new AssetsService(c).list())
assets.put('/links', authMiddleware, (c) => new AssetsService(c).setLinks())
assets.delete('/:id', authMiddleware, (c) => new AssetsService(c).remove())
assets.post('/urls', authMiddleware, (c) => new AssetsService(c).mintUrls())
assets.get('/:id/inline', authMiddleware, (c) => new AssetsService(c).inline())

/*
 * Pemegang share link: tokennya yang menjadi izin, jadi tidak ada sesi yang
 * dituntut. Aset yang boleh dilihat dibatasi ke yang benar-benar dirujuk
 * dokumen di balik token itu - lihat `AssetsService.authorizeAssets`.
 */
assets.post('/shared/:token/urls', (c) => new AssetsService(c).mintUrlsShared())
assets.get('/shared/:token/:id/inline', (c) => new AssetsService(c).inlineShared())

/*
 * `raw` dipanggil bingkai blok HTML, yang berasal-opaque dan karena itu tidak
 * pernah mengirim cookie. Tanda tangan pada URL-nya yang menjadi izin.
 */
assets.get('/:id/raw', (c) => new AssetsService(c).raw())

export default assets
