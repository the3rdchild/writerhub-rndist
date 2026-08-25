import { createRouter } from '@/lib/create-app'
import { authMiddleware } from '@/middlewares/auth'
import MemoryService from '@/services/memory/service'

const memory = createRouter().basePath('/memory')
memory.get('/', authMiddleware, (c) => new MemoryService(c).get())
memory.put('/', authMiddleware, (c) => new MemoryService(c).put())

export default memory
