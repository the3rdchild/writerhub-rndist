import { bootstrap } from './config/bootstrap'

void bootstrap().catch((error) => {
	console.error('❌ Failed to start server', error)
	process.exit(1)
})
