import { createRouter } from '@/lib/create-app'
import { authMiddleware } from '@/middlewares/auth'
import ShareService from '@/services/share/service'

const share = createRouter().basePath('/shares')

/**
 * Membuat share link membutuhkan autentikasi supaya kita tahu siapa pemiliknya.
 * Membuka share link lewat token bersifat publik untuk akses "anyone".
 */
share.post('/', authMiddleware, (c) => new ShareService(c).create())
share.get('/:token', (c) => new ShareService(c).getByToken())

export default share
