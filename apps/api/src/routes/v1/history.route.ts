import { createRouter } from '@/lib/create-app'
import { authMiddleware } from '@/middlewares/auth'
import HistoryService from '@/services/history/service'

const history = createRouter().basePath('/history')
history.get('/', authMiddleware, (c) => new HistoryService(c).list())
history.delete('/', authMiddleware, (c) => new HistoryService(c).clear())
history.get('/:jobId', authMiddleware, (c) => new HistoryService(c).getById())
history.delete('/:jobId', authMiddleware, (c) => new HistoryService(c).remove())

export default history
