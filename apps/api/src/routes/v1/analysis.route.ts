import { createRouter } from '@/lib/create-app'
import AnalysisService from '@/services/analysis/service'
import { authMiddleware } from '@/middlewares/auth'

const analysis = createRouter().basePath('/analyze')

analysis.use('*', authMiddleware)

analysis.post('/', (c) => new AnalysisService(c).create())

export default analysis
