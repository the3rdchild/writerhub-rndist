import { createRouter } from '@/lib/create-app'
import { authMiddleware } from '@/middlewares/auth'
import PoolingService from '@/services/pooling/service'

const status = createRouter().basePath('/status')

status.use('*', authMiddleware)

status.get('/:jobId', (c) => new PoolingService(c).getById())

export default status
