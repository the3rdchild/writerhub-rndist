import { createRouter } from '@/lib/create-app'
import { authMiddleware } from '@/middlewares/auth'
import ExportsService from '@/services/exports/service'

const exports_ = createRouter().basePath('/exports')

/** Menerbitkan tautan menuntut sesi - hanya pemilik dokumen yang boleh meminta. */
exports_.post('/:documentId/link', authMiddleware, (c) => new ExportsService(c).link())

/*
 * Membacanya tidak, dan itu disengaja: pembacanya peramban tak berkepala di
 * worker, yang tidak punya sesi dan tidak boleh diberi satu. Tanda tangan
 * bercakupan satu dokumen yang menjadi izinnya - lihat catatan di service.
 */
exports_.get('/:documentId', (c) => new ExportsService(c).read())

export default exports_
