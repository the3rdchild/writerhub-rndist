import { createRouter } from '@/lib/create-app'
import GrammarService from '@/services/grammar/service'
import { authMiddleware } from '@/middlewares/auth'

const grammar = createRouter().basePath('/grammar')

grammar.use('*', authMiddleware)

grammar.post('/', (c) => new GrammarService(c).create())

export default grammar
