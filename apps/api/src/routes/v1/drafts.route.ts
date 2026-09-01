import { createRouter } from '@/lib/create-app'
import { authMiddleware } from '@/middlewares/auth'
import DraftsService from '@/services/drafts/service'

const drafts = createRouter().basePath('/drafts')

drafts.use('*', authMiddleware)

drafts.post('/', (c) => new DraftsService(c).create())
drafts.get('/:documentId', (c) => new DraftsService(c).status())

export default drafts
