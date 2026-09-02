import { createRouter } from '@/lib/create-app'
import { authMiddleware } from '@/middlewares/auth'
import TemplatesService from '@/services/templates/service'

const templates = createRouter().basePath('/templates')
templates.get('/', authMiddleware, (c) => new TemplatesService(c).list())
templates.get('/:slug', authMiddleware, (c) => new TemplatesService(c).getBySlug())

export default templates
