/**
 * Menjalankan beberapa proses API dalam satu kontainer, berbagi satu port.
 *
 * Bun menjalankan JS di satu thread, jadi satu proses API mentok di ±1,25 core.
 * Pada uji beban 30 Sep, di titik itulah API jebol (±765 req/dtk) sementara
 * core lain menganggur. Setiap anak membuka `Bun.serve({ reusePort: true })`,
 * dan kernel membagi koneksi di antara mereka.
 *
 * Induknya tidak melayani apa pun. Ia hanya meneruskan sinyal berhenti, dan
 * kalau satu anak mati, ia ikut berhenti. Kontainer yang di-restart utuh lebih
 * mudah dipahami daripada kapasitas yang diam-diam tinggal separuh.
 */

/** Diset di setiap proses anak; induk tidak memilikinya. */
export const PROCESS_INDEX_ENV = 'API_PROCESS_INDEX'

export function isApiChildProcess(): boolean {
	return process.env[PROCESS_INDEX_ENV] !== undefined
}

/**
 * Pekerjaan sekali jalan saat boot (seed template) hanya dilakukan satu
 * proses, supaya beberapa anak tidak berlomba menulis baris yang sama.
 */
export function isPrimaryApiProcess(): boolean {
	return (process.env[PROCESS_INDEX_ENV] ?? '0') === '0'
}

export function spawnApiProcesses(count: number, entry: string): void {
	let stopping = false

	const children = Array.from({ length: count }, (_, index) =>
		Bun.spawn([process.execPath, entry], {
			env: { ...process.env, [PROCESS_INDEX_ENV]: String(index) },
			stdio: ['inherit', 'inherit', 'inherit'],
		}),
	)
	console.log(`⚡ API: ${count} proses (pid ${children.map((child) => child.pid).join(', ')})`)

	const stopAll = (signal: NodeJS.Signals) => {
		for (const child of children) {
			if (child.exitCode === null) child.kill(signal)
		}
	}

	for (const child of children) {
		void child.exited.then((code) => {
			if (stopping) return
			stopping = true
			console.error(`❌ Proses API ${child.pid} berhenti (kode ${code}); menghentikan proses lainnya`)
			stopAll('SIGTERM')
			void Promise.all(children.map((other) => other.exited)).then(() => process.exit(code || 1))
		})
	}

	const shutdown = (signal: NodeJS.Signals) => {
		if (stopping) return
		stopping = true
		stopAll(signal)
		void Promise.all(children.map((child) => child.exited)).then(() => process.exit(0))
	}
	process.on('SIGINT', () => shutdown('SIGINT'))
	process.on('SIGTERM', () => shutdown('SIGTERM'))
}
