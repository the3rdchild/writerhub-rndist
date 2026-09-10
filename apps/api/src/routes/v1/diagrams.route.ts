import { createRouter } from '@/lib/create-app'
import { authMiddleware } from '@/middlewares/auth'
import DiagramsService from '@/services/diagrams/service'

const diagrams = createRouter().basePath('/diagrams')

diagrams.use('*', authMiddleware)

diagrams.post('/draw', (c) => new DiagramsService(c).draw())

export default diagrams
