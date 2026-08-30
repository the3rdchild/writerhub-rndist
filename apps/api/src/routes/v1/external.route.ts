import { createRouter } from '@/lib/create-app'
import { authMiddleware } from '@/middlewares/auth'
import ExternalDocumentsService from '@/services/external-documents/service'

const external = createRouter().basePath('/external')
external.post('/documents', authMiddleware, (c) => new ExternalDocumentsService(c).create())

export default external
