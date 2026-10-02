import { COLLAB_FRAGMENT, COLLAB_MESSAGE, type CollabStatus } from '@writer-hub/shared'
import type { Subprocess } from 'bun'
import * as decoding from 'lib0/decoding'
import * as encoding from 'lib0/encoding'
import { WebsocketProvider } from 'y-websocket'
import * as Y from 'yjs'

/**
 * Alat uji ujung-ke-ujung kolaborasi: menjalankan proses API sungguhan dan
 * klien y-websocket di Bun. Dipakai `collab.integration.test.ts`; bukan kode
 * produksi dan tidak diimpor oleh aplikasi.
 */

export const API_DIR = new URL('../../', import.meta.url).pathname

export interface ApiProcess {
	readonly port: number
	readonly url: string
	readonly wsUrl: string
	readonly output: string[]
	stop(signal?: 'SIGTERM' | 'SIGKILL'): Promise<void>
}

/** Port bebas dari kernel: buka di port 0, catat, tutup. */
export function freePort(): number {
	const probe = Bun.serve({ port: 0, fetch: () => new Response(null) })
	const port = probe.port ?? 0
	probe.stop(true)
	return port
}

async function drain(stream: ReadableStream<Uint8Array>, sink: string[]): Promise<void> {
	const decoder = new TextDecoder()
	for await (const chunk of stream) sink.push(decoder.decode(chunk))
}

export async function startApi(port: number, env: Record<string, string>): Promise<ApiProcess> {
	const output: string[] = []
	const proc: Subprocess<'ignore', 'pipe', 'pipe'> = Bun.spawn([process.execPath, 'run', 'src/index.ts'], {
		cwd: API_DIR,
		env: { ...process.env, ...env, PORT: String(port), SERVICE_URL: `http://localhost:${port}` },
		stdin: 'ignore',
		stdout: 'pipe',
		stderr: 'pipe',
	})
	void drain(proc.stdout, output)
	void drain(proc.stderr, output)

	const url = `http://localhost:${port}`
	const deadline = Date.now() + 30_000
	for (;;) {
		if (proc.exitCode !== null) throw new Error(`API berhenti saat boot:\n${output.join('')}`)
		try {
			const response = await fetch(`${url}/api/v1/health`)
			if (response.ok) break
		} catch {
			// belum mendengar
		}
		if (Date.now() > deadline) {
			proc.kill('SIGKILL')
			throw new Error(`API tidak siap dalam 30 dtk:\n${output.join('')}`)
		}
		await Bun.sleep(150)
	}

	return {
		port,
		url,
		wsUrl: `ws://localhost:${port}/api/v1/collab/ws`,
		output,
		async stop(signal = 'SIGTERM') {
			if (proc.exitCode !== null) return
			// Dengan API_PROCESSES > 1 induknya hanya meneruskan SIGTERM/SIGINT;
			// SIGKILL ke induk meninggalkan anak-anaknya hidup sebagai yatim.
			const children = childPids(proc.pid)
			proc.kill(signal)
			if (signal === 'SIGKILL') killAll(children)
			const exited = await Promise.race([proc.exited.then(() => true), Bun.sleep(15_000).then(() => false)])
			if (!exited) {
				proc.kill('SIGKILL')
				killAll(children)
				await proc.exited
			}
		},
	}
}

function childPids(pid: number): number[] {
	const result = Bun.spawnSync(['pgrep', '-P', String(pid)])
	return result.stdout
		.toString()
		.split('\n')
		.map((line) => Number(line.trim()))
		.filter((child) => Number.isInteger(child) && child > 0)
}

function killAll(pids: readonly number[]): void {
	for (const pid of pids) {
		try {
			process.kill(pid, 'SIGKILL')
		} catch {
			// sudah berhenti
		}
	}
}

export async function apiJson<T>(base: string, path: string, init?: RequestInit): Promise<T> {
	const response = await fetch(`${base}${path}`, {
		...init,
		headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
	})
	const body = (await response.json().catch(() => ({}))) as { data?: T; errors?: string[] }
	if (!response.ok) {
		throw new Error(`${init?.method ?? 'GET'} ${path} → ${response.status}: ${body.errors?.join(', ')}`)
	}
	return body.data as T
}

export async function waitFor(
	predicate: () => boolean | Promise<boolean>,
	message: string,
	timeoutMs = 8_000,
): Promise<void> {
	const deadline = Date.now() + timeoutMs
	while (!(await predicate())) {
		if (Date.now() > deadline) throw new Error(`Batas waktu: ${message}`)
		await Bun.sleep(25)
	}
}

/** Satu paragraf berisi `text`, sebagai pembaruan Yjs yang berdiri sendiri. */
export function paragraphUpdate(text: string): Uint8Array {
	const doc = new Y.Doc()
	const paragraph = new Y.XmlElement('paragraph')
	paragraph.insert(0, [new Y.XmlText(text)])
	doc.getXmlFragment(COLLAB_FRAGMENT).insert(0, [paragraph])
	return Y.encodeStateAsUpdate(doc)
}

export function fragmentText(doc: Y.Doc): string {
	return doc
		.getXmlFragment(COLLAB_FRAGMENT)
		.toArray()
		.map((node) => (node instanceof Y.XmlElement ? node.toArray().join('') : String(node)))
		.join('\n')
}

export interface PeerOptions {
	epoch?: string
	/** Isi yang dikirim bila server meminta peer ini menyemai; tanpa ini peer tidak menyemai. */
	seed?: () => Uint8Array
	/** Sambung ulang otomatis setelah putus sementara (bawaan y-websocket). */
	reconnect?: boolean
}

/** Klien y-websocket sungguhan dengan penangan pesan `status` dan `seed`. */
export class TestPeer {
	readonly doc = new Y.Doc()
	readonly provider: WebsocketProvider
	readonly statuses: CollabStatus[] = []
	readonly closes: Array<{ code: number; reason: string }> = []

	constructor(
		wsUrl: string,
		tabId: string,
		ticket: string,
		private readonly options: PeerOptions = {},
	) {
		this.provider = new WebsocketProvider(wsUrl, tabId, this.doc, {
			params: { ticket, epoch: options.epoch ?? '' },
			disableBc: true,
			maxBackoffTime: 300,
			shouldReconnect: (event) => (options.reconnect ?? true) && !(event.code >= 4400 && event.code < 4500),
		})
		this.provider.messageHandlers[COLLAB_MESSAGE.status] = (_encoder, decoder) => {
			const status = JSON.parse(decoding.readVarString(decoder)) as CollabStatus
			this.statuses.push(status)
			if (status.state === 'seed' && this.options.seed) this.sendSeed(this.options.seed())
		}
		this.provider.messageHandlers[COLLAB_MESSAGE.seed] = () => {}
		this.provider.on('connection-close', (event) => {
			if (event) this.closes.push({ code: event.code, reason: event.reason })
		})
	}

	get lastStatus(): CollabStatus | undefined {
		return this.statuses.at(-1)
	}

	get text(): string {
		return fragmentText(this.doc)
	}

	sendSeed(update: Uint8Array): void {
		const encoder = encoding.createEncoder()
		encoding.writeVarUint(encoder, COLLAB_MESSAGE.seed)
		encoding.writeVarUint8Array(encoder, update)
		this.provider.ws?.send(encoding.toUint8Array(encoder))
	}

	type(text: string): void {
		const fragment = this.doc.getXmlFragment(COLLAB_FRAGMENT)
		const paragraph = new Y.XmlElement('paragraph')
		paragraph.insert(0, [new Y.XmlText(text)])
		fragment.insert(fragment.length, [paragraph])
	}

	async ready(timeoutMs = 8_000): Promise<void> {
		await waitFor(() => this.lastStatus?.state === 'ready' && this.provider.synced, 'peer siap', timeoutMs)
	}

	destroy(): void {
		this.provider.destroy()
		this.doc.destroy()
	}
}
