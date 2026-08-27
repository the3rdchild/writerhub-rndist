import { createRouter } from '@/lib/create-app'
import { authMiddleware } from '@/middlewares/auth'
import GrammarService from '@/services/grammar/service'

const grammar = createRouter().basePath('/grammar')

grammar.use('*', authMiddleware)

grammar.post('/', (c) => new GrammarService(c).create())

export default grammar
