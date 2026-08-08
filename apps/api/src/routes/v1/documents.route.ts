import { createRouter } from '@/lib/create-app'
import { authMiddleware } from '@/middlewares/auth'
import DocumentsService from '@/services/documents/service'
import VersionsService from '@/services/versions/service'

const documents = createRouter().basePath('/documents')

// Semua operasi dokumen membutuhkan autentikasi supaya selalu terskop ke
// pemiliknya. Di dev lokal `authMiddleware` mengisi userId 'local-dev'.
documents.get('/', authMiddleware, (c) => new DocumentsService(c).list())
documents.post('/', authMiddleware, (c) => new DocumentsService(c).create())
documents.get('/:id', authMiddleware, (c) => new DocumentsService(c).getById())
documents.put('/:id', authMiddleware, (c) => new DocumentsService(c).update())
documents.delete('/:id', authMiddleware, (c) => new DocumentsService(c).remove())

// Riwayat versi dokumen (sub-path `/:id/versions`, tidak bentrok dengan `/:id`
// karena Hono mencocokkan segmen path secara lengkap).
documents.get('/:id/versions', authMiddleware, (c) => new VersionsService(c).list())
documents.get('/:id/versions/:versionId', authMiddleware, (c) => new VersionsService(c).getById())
documents.post('/:id/versions', authMiddleware, (c) => new VersionsService(c).create())
documents.post('/:id/versions/:versionId/restore', authMiddleware, (c) =>
	new VersionsService(c).restore(),
)

export default documents
