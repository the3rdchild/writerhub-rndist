import { createRouter } from '@/lib/create-app'
import { authMiddleware } from '@/middlewares/auth'
import ShareService from '@/services/share/service'

const share = createRouter().basePath('/shares')
share.post('/', authMiddleware, (c) => new ShareService(c).create())
share.get('/', authMiddleware, (c) => new ShareService(c).current())
share.get('/:token', (c) => new ShareService(c).getByToken())
share.patch('/:token', authMiddleware, (c) => new ShareService(c).update())
share.delete('/:token', authMiddleware, (c) => new ShareService(c).revoke())

export default share
