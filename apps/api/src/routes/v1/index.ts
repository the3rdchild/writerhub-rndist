import analysis from './analysis.route'
import chat from './chat.route'
import documents from './documents.route'
import drafts from './drafts.route'
import files from './files.route'
import grammar from './grammar.route'
import health from './health.route'
import history from './history.route'
import jobs from './jobs.route'
import memory from './memory.route'
import projects from './projects.route'
import research from './research.route'
import share from './share.route'
import status from './status.route'
import stream from './stream.route'
import tabs from './tabs.route'

export const v1Routes = [
	health,
	grammar,
	analysis,
	chat,
	status,
	stream,
	jobs,
	files,
	share,
	documents,
	tabs,
	projects,
	memory,
	history,
	research,
	drafts,
]
