import { createRouter } from '@/lib/create-app'
import { authMiddleware } from '@/middlewares/auth'
import HistoryService from '@/services/history/service'

const history = createRouter().basePath('/history')

// Aktivitas AI (fitur F). Semua operasi terskop ke userId dari authMiddleware
// (di dev lokal selalu 'local-dev'); baris pool_request lama dengan user_id
// NULL tidak pernah muncul di daftar.
history.get('/', authMiddleware, (c) => new HistoryService(c).list())
history.delete('/', authMiddleware, (c) => new HistoryService(c).clear())
history.get('/:jobId', authMiddleware, (c) => new HistoryService(c).getById())
history.delete('/:jobId', authMiddleware, (c) => new HistoryService(c).remove())

export default history
