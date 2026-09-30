import { env } from '@/config/env'
import { createRouter } from '@/lib/create-app'
import { authMiddleware } from '@/middlewares/auth'
import { rateLimit } from '@/middlewares/rate-limit'
import DraftsService from '@/services/drafts/service'

const drafts = createRouter().basePath('/drafts')

drafts.use('*', authMiddleware)

// Buat dan coba-ulang berbagi satu ember: keduanya memulai penulisan AI.
const draftLimit = rateLimit('drafts', 'permintaan draf', env.RATE_LIMIT_DRAFTS_PER_MIN)

drafts.post('/', draftLimit, (c) => new DraftsService(c).create())
drafts.get('/:documentId', (c) => new DraftsService(c).status())
drafts.post('/:documentId/retry', draftLimit, (c) => new DraftsService(c).retry())

export default drafts
