import { createRouter } from '@/lib/create-app'
import { authMiddleware } from '@/middlewares/auth'
import DocumentsService from '@/services/documents/service'

const documents = createRouter().basePath('/documents')

// Semua operasi dokumen membutuhkan autentikasi supaya selalu terskop ke
// pemiliknya. Di dev lokal `authMiddleware` mengisi userId 'local-dev'.
documents.get('/', authMiddleware, (c) => new DocumentsService(c).list())
documents.post('/', authMiddleware, (c) => new DocumentsService(c).create())
documents.get('/:id', authMiddleware, (c) => new DocumentsService(c).getById())
documents.put('/:id', authMiddleware, (c) => new DocumentsService(c).update())
documents.delete('/:id', authMiddleware, (c) => new DocumentsService(c).remove())

export default documents
