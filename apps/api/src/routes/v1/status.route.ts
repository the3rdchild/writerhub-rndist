import { createRouter } from '@/lib/create-app'
import PoolingService from '@/services/pooling/service'
import { authMiddleware } from '@/middlewares/auth'

const status = createRouter().basePath('/status')

status.use('*', authMiddleware)

status.get('/:jobId', (c) => new PoolingService(c).getById())

export default status
