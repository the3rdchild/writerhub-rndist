import { createRouter } from '@/lib/create-app'
import { authMiddleware } from '@/middlewares/auth'
import AnalysisService from '@/services/analysis/service'

const analysis = createRouter().basePath('/analyze')

analysis.use('*', authMiddleware)

analysis.post('/', (c) => new AnalysisService(c).create())

export default analysis
