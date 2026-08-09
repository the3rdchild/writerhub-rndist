import { createRouter } from '@/lib/create-app'
import { authMiddleware } from '@/middlewares/auth'
import ProjectsService from '@/services/projects/service'

const projects = createRouter().basePath('/projects')

// Semua operasi proyek membutuhkan autentikasi supaya selalu terskop ke
// pemiliknya. Di dev lokal `authMiddleware` mengisi userId 'local-dev'.
projects.get('/', authMiddleware, (c) => new ProjectsService(c).list())
projects.post('/', authMiddleware, (c) => new ProjectsService(c).create())
projects.put('/:id', authMiddleware, (c) => new ProjectsService(c).update())
projects.delete('/:id', authMiddleware, (c) => new ProjectsService(c).remove())

export default projects
