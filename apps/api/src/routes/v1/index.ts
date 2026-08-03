import analysis from './analysis.route'
import files from './files.route'
import grammar from './grammar.route'
import health from './health.route'
import status from './status.route'
import stream from './stream.route'

export const v1Routes = [health, grammar, analysis, status, stream, files]
