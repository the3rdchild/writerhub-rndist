import { env } from './config/env'
import { isApiChildProcess, spawnApiProcesses } from './config/processes'

if (env.API_PROCESSES > 1 && !isApiChildProcess()) {
	// Induk tidak mengimpor bootstrap sama sekali, supaya ia tidak ikut membuka
	// koneksi Postgres/Redis yang tidak pernah dipakainya.
	spawnApiProcesses(env.API_PROCESSES, import.meta.path)
} else {
	const { bootstrap } = await import('./config/bootstrap')
	void bootstrap().catch((error) => {
		console.error('❌ Failed to start server', error)
		process.exit(1)
	})
}
