import { createRouter } from '@/lib/create-app'
import { authMiddleware } from '@/middlewares/auth'
import SkillsService from '@/services/skills/service'

const skills = createRouter().basePath('/skills')

skills.use('*', authMiddleware)

skills.post('/read', (c) => new SkillsService(c).read())

export default skills
