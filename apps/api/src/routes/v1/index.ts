import analysis from './analysis.route'
import chat from './chat.route'
import files from './files.route'
import grammar from './grammar.route'
import health from './health.route'
import share from './share.route'
import status from './status.route'
import stream from './stream.route'

export const v1Routes = [health, grammar, analysis, chat, status, stream, files, share]
