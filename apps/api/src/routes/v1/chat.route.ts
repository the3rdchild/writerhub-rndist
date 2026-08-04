import { createRouter } from '@/lib/create-app'
import { authMiddleware } from '@/middlewares/auth'
import ChatService from '@/services/chat/service'

const chat = createRouter().basePath('/chat')

chat.use('*', authMiddleware)

chat.post('/', (c) => new ChatService(c).stream())

export default chat
