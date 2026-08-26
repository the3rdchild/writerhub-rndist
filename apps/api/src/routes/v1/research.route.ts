import { createRouter } from '@/lib/create-app'
import { authMiddleware } from '@/middlewares/auth'
import ResearchService from '@/services/research/service'

const research = createRouter().basePath('/research')

research.use('*', authMiddleware)

research.post('/search', (c) => new ResearchService(c).search())
research.post('/extract', (c) => new ResearchService(c).extract())

export default research
