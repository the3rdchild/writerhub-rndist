import { env } from '@/config/env'
import { createRouter } from '@/lib/create-app'
import { authMiddleware } from '@/middlewares/auth'
import { rateLimit } from '@/middlewares/rate-limit'
import ChatService from '@/services/chat/service'

const chat = createRouter().basePath('/chat')

chat.use('*', authMiddleware)

chat.post('/', rateLimit('chat', 'permintaan chat', env.RATE_LIMIT_CHAT_PER_MIN), (c) =>
	new ChatService(c).stream(),
)

export default chat
