import { env } from '@/config/env'
import { createRouter } from '@/lib/create-app'
import { authMiddleware } from '@/middlewares/auth'
import { rateLimit } from '@/middlewares/rate-limit'
import GrammarService from '@/services/grammar/service'

const grammar = createRouter().basePath('/grammar')

grammar.use('*', authMiddleware)

grammar.post('/', rateLimit('grammar', 'pemeriksaan grammar', env.RATE_LIMIT_GRAMMAR_PER_MIN), (c) =>
	new GrammarService(c).create(),
)

export default grammar
