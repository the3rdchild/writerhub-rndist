import { createRouter } from '@/lib/create-app'
import { authMiddleware } from '@/middlewares/auth'
import DocumentsService from '@/services/documents/service'
import TabsService from '@/services/tabs/service'

const documents = createRouter().basePath('/documents')
documents.get('/', authMiddleware, (c) => new DocumentsService(c).list())
documents.post('/', authMiddleware, (c) => new DocumentsService(c).create())
documents.get('/:id', authMiddleware, (c) => new DocumentsService(c).getById())
documents.put('/:id', authMiddleware, (c) => new DocumentsService(c).update())
documents.delete('/:id', authMiddleware, (c) => new DocumentsService(c).remove())
documents.get('/:id/tabs', authMiddleware, (c) => new TabsService(c).list())
documents.post('/:id/tabs', authMiddleware, (c) => new TabsService(c).create())
documents.post('/:id/tabs/reorder', authMiddleware, (c) => new TabsService(c).reorder())

export default documents
