import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { randomUUID } from 'node:crypto'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { COLLAB_CLOSE, COLLAB_FRAGMENT, type CollabTicket } from '@writer-hub/shared'
import postgres from 'postgres'
import {
	type ApiProcess,
	apiJson,
	freePort,
	paragraphUpdate,
	startApi,
	TestPeer,
	waitFor,
} from './test-harness'
import { createTicketSigner } from './ticket'

/*
 * Uji ujung-ke-ujung: proses API sungguhan (Bun.serve + websocket), Postgres,
 * Redis, dan klien y-websocket. Butuh basis data TERPISAH yang skemanya sudah
 * dipasang (`bun run db:push`), misalnya:
 *
 *   COLLAB_IT_DATABASE_URL=postgresql://writer:writer@localhost:5433/writer_hub_kolab \
 *   COLLAB_IT_REDIS_DB=1 bun test src/collab/collab.integration.test.ts
 *
 * Tanpa COLLAB_IT_DATABASE_URL seluruh berkas dilewati - dan itu DIUMUMKAN di
 * keluaran, bukan diam-diam hijau.
 */

const DATABASE_URL = process.env.COLLAB_IT_DATABASE_URL ?? ''
const enabled = DATABASE_URL !== ''
if (!enabled) {
	console.warn(
		'[collab.integration] DILEWATI: set COLLAB_IT_DATABASE_URL (basis data uji terpisah) untuk menjalankannya',
	)
}

const SECRET = `it-${randomUUID()}`
const BASE_ENV: Record<string, string> = {
	DATABASE_URL,
	REDIS_HOST: process.env.COLLAB_IT_REDIS_HOST ?? 'localhost',
	REDIS_PORT: process.env.COLLAB_IT_REDIS_PORT ?? '6379',
	REDIS_DB: process.env.COLLAB_IT_REDIS_DB ?? '1',
	// Kanal pub/sub berlaku lintas indeks DB: awalan unik per putaran uji.
	COLLAB_REDIS_PREFIX: `collab-it-${randomUUID().slice(0, 8)}:`,
	COLLAB_TICKET_SECRET: SECRET,
	COLLAB_ROOM_IDLE_S: '1',
	COLLAB_DERIVE_DEBOUNCE_MS: '150',
	COLLAB_DERIVE_MAX_MS: '600',
	AUTH_MODE: 'none',
	STORAGE_DRIVER: 'local',
	STORAGE_DIR: mkdtempSync(join(tmpdir(), 'collab-it-')),
	RESEARCH_ENABLED: 'false',
	API_PROCESSES: '1',
}

interface Fixture {
	documentId: string
	tabId: string
}

const sql = enabled ? postgres(DATABASE_URL, { max: 2 }) : null
const started: ApiProcess[] = []
const peers: TestPeer[] = []

async function api(env: Record<string, string> = {}, port = freePort()): Promise<ApiProcess> {
	const process_ = await startApi(port, { ...BASE_ENV, ...env })
	started.push(process_)
	return process_
}

async function createDocument(base: ApiProcess, text: string): Promise<Fixture> {
	const created = await apiJson<{ id: string; tabs: Array<{ id: string }> }>(base.url, '/api/v1/documents', {
		method: 'POST',
		body: JSON.stringify({
			title: `IT kolaborasi ${text}`,
			content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] },
		}),
	})
	return { documentId: created.id, tabId: created.tabs[0].id }
}

async function ticketFor(base: ApiProcess, tabId: string): Promise<CollabTicket> {
	return apiJson<CollabTicket>(base.url, '/api/v1/collab/tickets', {
		method: 'POST',
		body: JSON.stringify({ tabId }),
	})
}

function peer(
	base: ApiProcess,
	tabId: string,
	ticket: string,
	options: ConstructorParameters<typeof TestPeer>[3] = {},
) {
	const created = new TestPeer(base.wsUrl, tabId, ticket, options)
	peers.push(created)
	return created
}

async function serverContent(base: ApiProcess, tabId: string): Promise<string> {
	const tab = await apiJson<{ content: unknown }>(base.url, `/api/v1/tabs/${tabId}`)
	return JSON.stringify(tab.content)
}

function database(): postgres.Sql {
	if (!sql) throw new Error('COLLAB_IT_DATABASE_URL belum diset')
	return sql
}

async function headRows(tabId: string): Promise<number> {
	const rows = await database()`select count(*)::int as n from collab_documents where tab_id = ${tabId}`
	return rows[0].n as number
}

async function logRows(tabId: string): Promise<number> {
	const rows = await database()`select count(*)::int as n from collab_updates where tab_id = ${tabId}`
	return rows[0].n as number
}

/** Isi semaian yang meniru "naskah server" milik fixture. */
const seedFrom = (text: string) => () => paragraphUpdate(text)

describe.skipIf(!enabled)('kolaborasi ujung-ke-ujung (proses API sungguhan)', () => {
	let main: ApiProcess

	beforeAll(async () => {
		main = await api()
	}, 60_000)

	afterAll(async () => {
		for (const created of peers.splice(0)) created.destroy()
		await Promise.all(
			started.splice(0).map(async (process_) => {
				const begin = Date.now()
				await process_.stop('SIGTERM')
				// COLLAB_IT_LOG=1 mencetak keluaran setiap proses API untuk diperiksa.
				if (process.env.COLLAB_IT_LOG) {
					console.log(
						`\n── API :${process_.port} (berhenti ${Date.now() - begin} ms) ──\n${process_.output.join('')}`,
					)
				}
			}),
		)
		await sql?.end()
	}, 60_000)

	test('tiga klien: suntingan saling tiba, konvergen, dan isi server diturunkan dari state Yjs', async () => {
		const { tabId } = await createDocument(main, 'AWAL-3')
		const tickets = await Promise.all([1, 2, 3].map(() => ticketFor(main, tabId)))
		expect(tickets[0]).toMatchObject({ role: 'editor', readOnly: false, epoch: null, tabId })

		const [a, b, c] = tickets.map((ticket) => peer(main, tabId, ticket.ticket, { seed: seedFrom('AWAL-3') }))
		await Promise.all([a.ready(), b.ready(), c.ready()])
		expect(a.text).toBe('AWAL-3')

		a.type('dari-A')
		b.type('dari-B')
		c.type('dari-C')
		await waitFor(
			() => [a, b, c].every((p) => ['dari-A', 'dari-B', 'dari-C'].every((t) => p.text.includes(t))),
			'tiga suntingan tiba di semua klien',
		)
		expect(new Set([a.text, b.text, c.text]).size).toBe(1)
		expect(a.text.split('\n').filter((line) => line === 'AWAL-3')).toHaveLength(1)

		await waitFor(async () => (await serverContent(main, tabId)).includes('dari-C'), 'isi server diturunkan')
		const content = await serverContent(main, tabId)
		for (const text of ['AWAL-3', 'dari-A', 'dari-B', 'dari-C']) expect(content).toContain(text)
	}, 30_000)

	test('penyemaian hanya sekali walau beberapa klien datang bersamaan', async () => {
		const { tabId } = await createDocument(main, 'AWAL-RACE')
		const tickets = await Promise.all([1, 2, 3, 4].map(() => ticketFor(main, tabId)))
		const racers = tickets.map((ticket, index) =>
			peer(main, tabId, ticket.ticket, { seed: seedFrom(`SEMAI-${index}`) }),
		)
		await Promise.all(racers.map((p) => p.ready()))

		const winner = racers[0].text
		expect(winner).toMatch(/^SEMAI-\d$/)
		for (const racer of racers) expect(racer.text).toBe(winner)
		expect(racers.filter((p) => p.statuses.some((s) => s.state === 'seed'))).toHaveLength(1)
		expect(await headRows(tabId)).toBe(1)
		expect(await logRows(tabId)).toBe(1)
	}, 30_000)

	test('viewer lewat tautan berbagi menerima isi, tetapi suntingannya ditolak', async () => {
		const { documentId, tabId } = await createDocument(main, 'AWAL-VIEW')
		const share = await apiJson<{ token: string }>(main.url, '/api/v1/shares', {
			method: 'POST',
			body: JSON.stringify({ documentId, access: 'anyone', role: 'viewer' }),
		})
		const viewerTicket = await apiJson<CollabTicket>(
			main.url,
			`/api/v1/collab/shared/${share.token}/tickets`,
			{
				method: 'POST',
				body: JSON.stringify({ tabId }),
			},
		)
		expect(viewerTicket).toMatchObject({ role: 'viewer', readOnly: true })

		const editor = peer(main, tabId, (await ticketFor(main, tabId)).ticket, { seed: seedFrom('AWAL-VIEW') })
		await editor.ready()
		const viewer = peer(main, tabId, viewerTicket.ticket)
		await viewer.ready()
		expect(viewer.lastStatus).toMatchObject({ readOnly: true, role: 'viewer' })

		viewer.type('VIEWER-MENULIS')
		editor.type('editor-menulis')
		await waitFor(() => viewer.text.includes('editor-menulis'), 'viewer menerima suntingan editor')
		await Bun.sleep(700)
		expect(editor.text).not.toContain('VIEWER-MENULIS')
		expect(await serverContent(main, tabId)).not.toContain('VIEWER-MENULIS')

		// Klien baru (state bersih) juga tidak pernah melihatnya.
		const fresh = peer(main, tabId, (await ticketFor(main, tabId)).ticket)
		await fresh.ready()
		expect(fresh.text).toContain('editor-menulis')
		expect(fresh.text).not.toContain('VIEWER-MENULIS')

		// Tiket viewer tidak bisa dipakai di tab lain.
		const other = await createDocument(main, 'LAIN')
		await expect(
			apiJson(main.url, `/api/v1/collab/shared/${share.token}/tickets`, {
				method: 'POST',
				body: JSON.stringify({ tabId: other.tabId }),
			}),
		).rejects.toThrow(/404/)
	}, 30_000)

	test('tautan berbagi: ganti peran memutus tamu (4401) dan tiket barunya membawa peran baru; dicabut → 404', async () => {
		const { documentId, tabId } = await createDocument(main, 'AWAL-PERAN')
		const owner = peer(main, tabId, (await ticketFor(main, tabId)).ticket, { seed: seedFrom('AWAL-PERAN') })
		await owner.ready()
		const share = await apiJson<{ token: string }>(main.url, '/api/v1/shares', {
			method: 'POST',
			body: JSON.stringify({ documentId, access: 'anyone', role: 'viewer' }),
		})
		const shareTicket = () =>
			apiJson<CollabTicket>(main.url, `/api/v1/collab/shared/${share.token}/tickets`, {
				method: 'POST',
				body: JSON.stringify({ tabId }),
			})
		const guest = peer(main, tabId, (await shareTicket()).ticket, { reconnect: false })
		await guest.ready()
		// Tamu mengaku sebagai pemilik di kehadiran: server memaksakan nama dari tiket.
		guest.provider.awareness.setLocalStateField('user', { name: 'local-dev', color: '#f00' })
		await waitFor(
			() =>
				(owner.provider.awareness.getStates().get(guest.doc.clientID)?.user as { name?: string } | undefined)
					?.name === 'Guest',
			'nama tamu dipaksa Guest',
		)

		await apiJson(main.url, `/api/v1/shares/${share.token}`, {
			method: 'PATCH',
			body: JSON.stringify({ role: 'editor' }),
		})
		await waitFor(() => guest.closes.some((close) => close.code === COLLAB_CLOSE.ticket), 'tamu diputus 4401')
		expect(owner.closes).toHaveLength(0)
		expect(await shareTicket()).toMatchObject({ role: 'editor', readOnly: false })

		await apiJson(main.url, `/api/v1/shares/${share.token}`, { method: 'DELETE' })
		await expect(shareTicket()).rejects.toThrow(/404/)
	}, 30_000)

	test('versi: cadangan membawa isi dari klien; sebelum-pulihkan memotret isi terkini dari log', async () => {
		const { tabId } = await createDocument(main, 'AWAL-VERSI')
		const versions = await apiJson<Array<{ id: string }>>(main.url, `/api/v1/tabs/${tabId}/versions`)
		const writer = peer(main, tabId, (await ticketFor(main, tabId)).ticket, {
			seed: seedFrom('AWAL-VERSI'),
			reconnect: false,
		})
		await writer.ready()

		const backup = await apiJson<{ id: string }>(main.url, `/api/v1/tabs/${tabId}/versions`, {
			method: 'POST',
			body: JSON.stringify({
				label: 'Unsynced copy',
				content: {
					type: 'doc',
					content: [{ type: 'paragraph', content: [{ type: 'text', text: 'CADANGAN' }] }],
				},
			}),
		})
		const stored = await apiJson<{ content: unknown; label: string }>(
			main.url,
			`/api/v1/tabs/${tabId}/versions/${backup.id}`,
		)
		expect(JSON.stringify(stored.content)).toContain('CADANGAN')
		expect(stored.label).toBe('Unsynced copy')

		// Diketik lalu langsung dipulihkan, jauh sebelum isi tab sempat diturunkan
		// (2 dtk): versi sebelum-pulihkan tetap memuatnya.
		writer.type('SESAAT-SEBELUM-PULIHKAN')
		await Bun.sleep(250)
		const restored = await apiJson<{ preRestoreVersionId: string }>(
			main.url,
			`/api/v1/tabs/${tabId}/versions/${versions[0].id}/restore`,
			{ method: 'POST' },
		)
		const preRestore = await apiJson<{ content: unknown }>(
			main.url,
			`/api/v1/tabs/${tabId}/versions/${restored.preRestoreVersionId}`,
		)
		expect(JSON.stringify(preRestore.content)).toContain('SESAAT-SEBELUM-PULIHKAN')
	}, 30_000)

	test('tiket lewat tautan berbagi dibatasi lajunya per tautan (429)', async () => {
		const limited = await api({ RATE_LIMIT_SHARE_TICKETS_PER_MIN: '3' })
		const { documentId, tabId } = await createDocument(limited, 'AWAL-LAJU')
		const share = await apiJson<{ token: string }>(limited.url, '/api/v1/shares', {
			method: 'POST',
			body: JSON.stringify({ documentId, access: 'anyone', role: 'viewer' }),
		})
		const statuses: number[] = []
		for (let i = 0; i < 5; i += 1) {
			const response = await fetch(`${limited.url}/api/v1/collab/shared/${share.token}/tickets`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ tabId }),
			})
			statuses.push(response.status)
		}
		expect(statuses.filter((status) => status === 200)).toHaveLength(3)
		expect(statuses.filter((status) => status === 429)).toHaveLength(2)
	}, 30_000)

	test('tiket kedaluwarsa, palsu, untuk tab lain, atau kosong ditolak 4401', async () => {
		const { tabId } = await createDocument(main, 'AWAL-TIKET')
		const other = await createDocument(main, 'LAIN-TIKET')
		const signer = createTicketSigner(SECRET)
		const claims = { tab: tabId, doc: 'x', sub: 'x', uid: null, name: 'x', role: 'editor' as const }
		const expired = signer.sign(claims, -5).ticket
		const forged = createTicketSigner('kunci-lain').sign(claims, 60).ticket
		const wrongTab = (await ticketFor(main, other.tabId)).ticket

		for (const ticket of [expired, forged, wrongTab, '']) {
			const rejected = peer(main, tabId, ticket, { reconnect: false })
			await waitFor(() => rejected.closes.length > 0, 'sambungan ditolak')
			expect(rejected.closes[0].code).toBe(COLLAB_CLOSE.ticket)
			expect(rejected.statuses).toHaveLength(0)
			rejected.destroy()
		}
		expect(await headRows(tabId)).toBe(0)
	}, 30_000)

	test('isi bertahan setelah API di-restart (berhenti rapi) dan room dimuat ulang dari log', async () => {
		const port = freePort()
		let instance = await api({}, port)
		const { tabId } = await createDocument(instance, 'AWAL-RESTART')
		const writer = peer(instance, tabId, (await ticketFor(instance, tabId)).ticket, {
			seed: seedFrom('AWAL-RESTART'),
			reconnect: false,
		})
		await writer.ready()
		for (let i = 0; i < 25; i += 1) writer.type(`baris-${i}`)
		// Cukup untuk sampai di server, belum cukup untuk jeda tulis (100 ms):
		// yang menyimpannya adalah jalur berhenti-rapi, dan penulis tidak akan
		// menyambung ulang untuk mengirimnya lagi.
		await Bun.sleep(40)
		await instance.stop('SIGTERM')
		writer.destroy()

		instance = await api({}, port)
		const reader = peer(instance, tabId, (await ticketFor(instance, tabId)).ticket)
		await reader.ready()
		expect(reader.text.split('\n')).toEqual([
			'AWAL-RESTART',
			...Array.from({ length: 25 }, (_, i) => `baris-${i}`),
		])
		const ticket = await ticketFor(instance, tabId)
		expect(ticket.epoch).toBe(reader.lastStatus?.epoch ?? 'x')
	}, 60_000)

	test('API mati mendadak: klien yang masih memegang suntingan mengirimnya ulang setelah tersambung lagi', async () => {
		const port = freePort()
		let instance = await api({}, port)
		const { tabId } = await createDocument(instance, 'AWAL-CRASH')
		const writer = peer(instance, tabId, (await ticketFor(instance, tabId)).ticket, {
			seed: seedFrom('AWAL-CRASH'),
		})
		await writer.ready()
		writer.type('sebelum-mati')
		// SIGKILL tepat setelah mengetik: antrean tulis (100 ms) belum tentu sempat tercatat.
		await instance.stop('SIGKILL')
		writer.type('selama-mati')

		instance = await api({}, port)
		// Tiket (60 dtk) masih berlaku, jadi y-websocket menyambung ulang sendiri
		// dan sync step 2-nya membawa semua yang belum dimiliki server.
		await waitFor(() => writer.provider.synced, 'penulis tersambung ulang', 15_000)
		const reader = peer(instance, tabId, (await ticketFor(instance, tabId)).ticket)
		await reader.ready()
		await waitFor(() => reader.text.includes('selama-mati'), 'suntingan selama mati tiba')
		expect(reader.text).toContain('sebelum-mati')
	}, 60_000)

	test('dua proses API berbagi Redis: suntingan menyeberang, dan semaian tetap satu', async () => {
		const left = await api()
		const right = await api()
		const { tabId } = await createDocument(left, 'AWAL-FANOUT')
		const [ticketL, ticketR] = await Promise.all([ticketFor(left, tabId), ticketFor(right, tabId)])
		// Datang bersamaan di dua proses berbeda, dua-duanya siap menyemai.
		const onLeft = peer(left, tabId, ticketL.ticket, { seed: seedFrom('SEMAI-KIRI') })
		const onRight = peer(right, tabId, ticketR.ticket, { seed: seedFrom('SEMAI-KANAN') })
		await Promise.all([onLeft.ready(), onRight.ready()])
		expect(onLeft.text).toBe(onRight.text)
		expect(['SEMAI-KIRI', 'SEMAI-KANAN']).toContain(onLeft.text)
		expect(await headRows(tabId)).toBe(1)

		onLeft.type('ditulis-di-kiri')
		await waitFor(() => onRight.text.includes('ditulis-di-kiri'), 'kiri → kanan')
		onRight.type('ditulis-di-kanan')
		await waitFor(() => onLeft.text.includes('ditulis-di-kanan'), 'kanan → kiri')
		expect(onLeft.text).toBe(onRight.text)

		// Seperti gambar base64 yang ditempel (±400 KB): menyeberang sebagai
		// rujukan baris log, lalu diambil instance lain dari Postgres.
		const large = `GAMBAR-${'x'.repeat(400_000)}`
		onLeft.type(large)
		await waitFor(() => onRight.text.includes(large), 'pembaruan besar kiri → kanan', 15_000)

		// Kehadiran ikut menyeberang: kolaborator di proses lain terlihat - dengan
		// nama dari TIKETNYA (server menimpa nama yang diaku klien).
		onLeft.provider.awareness.setLocalStateField('user', { name: 'Penulis Kiri', color: '#abcdef' })
		await waitFor(
			() =>
				[...onRight.provider.awareness.getStates().values()].some((state) => {
					const user = state.user as { name?: string; color?: string } | undefined
					return user?.color === '#abcdef' && user.name === 'local-dev'
				}),
			'awareness kiri → kanan',
		)
		// Dan hilang begitu ia pergi.
		const leftClient = onLeft.doc.clientID
		onLeft.destroy()
		await waitFor(() => !onRight.provider.awareness.getStates().has(leftClient), 'awareness dibersihkan')
	}, 60_000)

	test('room yang sepi dilepas: log dipadatkan menjadi satu baris dan isinya utuh saat dimuat lagi', async () => {
		const { tabId } = await createDocument(main, 'AWAL-PADAT')
		const writer = peer(main, tabId, (await ticketFor(main, tabId)).ticket, {
			seed: seedFrom('AWAL-PADAT'),
			reconnect: false,
		})
		await writer.ready()
		// Lebih lambat dari jeda tulis (100 ms): setiap suntingan menjadi satu baris log.
		for (let i = 0; i < 30; i += 1) {
			writer.type(`padat-${i}`)
			await Bun.sleep(120)
		}
		await waitFor(async () => (await logRows(tabId)) >= 20, 'log bertambah per batch')
		const before = await logRows(tabId)
		writer.destroy()

		// COLLAB_ROOM_IDLE_S=1: room dilepas, antrean ditulis, log dipadatkan.
		await waitFor(async () => (await logRows(tabId)) === 1, 'log dipadatkan', 10_000)
		const reader = peer(main, tabId, (await ticketFor(main, tabId)).ticket)
		await reader.ready()
		expect(reader.text.split('\n')).toEqual([
			'AWAL-PADAT',
			...Array.from({ length: 30 }, (_, i) => `padat-${i}`),
		])
		expect(before).toBeGreaterThanOrEqual(20)
	}, 30_000)

	test('API_PROCESSES=2: enam klien di satu port (dibagi kernel) tetap konvergen', async () => {
		const pair = await api({ API_PROCESSES: '2' })
		const { tabId } = await createDocument(pair, 'AWAL-PROSES')
		const tickets = await Promise.all(Array.from({ length: 6 }, () => ticketFor(pair, tabId)))
		const crowd = tickets.map((ticket) => peer(pair, tabId, ticket.ticket, { seed: seedFrom('AWAL-PROSES') }))
		await Promise.all(crowd.map((p) => p.ready()))
		crowd.forEach((p, index) => {
			p.type(`klien-${index}`)
		})
		await waitFor(
			() => crowd.every((p) => crowd.every((_, index) => p.text.includes(`klien-${index}`))),
			'semua suntingan tiba di semua klien',
			15_000,
		)
		expect(new Set(crowd.map((p) => p.text)).size).toBe(1)
		expect(await headRows(tabId)).toBe(1)
	}, 60_000)

	test('PUT isi untuk tab kolaboratif diabaikan; judul tetap tersimpan', async () => {
		const { tabId } = await createDocument(main, 'AWAL-PUT')
		const writer = peer(main, tabId, (await ticketFor(main, tabId)).ticket, { seed: seedFrom('AWAL-PUT') })
		await writer.ready()
		writer.type('suntingan-kolaborator')
		await waitFor(async () => (await serverContent(main, tabId)).includes('suntingan-kolaborator'), 'turunan')

		await apiJson(main.url, `/api/v1/tabs/${tabId}`, {
			method: 'PUT',
			body: JSON.stringify({
				title: 'Judul baru',
				content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'BASI' }] }] },
			}),
		})
		const tab = await apiJson<{ title: string; content: unknown }>(main.url, `/api/v1/tabs/${tabId}`)
		expect(tab.title).toBe('Judul baru')
		expect(JSON.stringify(tab.content)).not.toContain('BASI')
		expect(JSON.stringify(tab.content)).toContain('suntingan-kolaborator')
	}, 30_000)

	test('hapusan saja (tanpa sisipan) tetap sampai ke isi server', async () => {
		const { tabId } = await createDocument(main, 'AWAL-HAPUS')
		const writer = peer(main, tabId, (await ticketFor(main, tabId)).ticket, { seed: seedFrom('AWAL-HAPUS') })
		await writer.ready()
		writer.type('PARAGRAF-RAHASIA')
		await waitFor(
			async () => (await serverContent(main, tabId)).includes('PARAGRAF-RAHASIA'),
			'turunan sisipan',
		)

		// Pemilik menghapus paragraf itu dan berhenti mengetik: halaman berbagi,
		// ekspor, dan obrolan AI membaca isi turunan ini.
		const fragment = writer.doc.getXmlFragment(COLLAB_FRAGMENT)
		fragment.delete(fragment.length - 1, 1)
		await waitFor(
			async () => !(await serverContent(main, tabId)).includes('PARAGRAF-RAHASIA'),
			'turunan hapusan',
		)
		expect(await serverContent(main, tabId)).toContain('AWAL-HAPUS')
	}, 30_000)

	test('pulihkan versi me-reset state: klien diputus 4409 dan room disemai ulang dari isi yang dipulihkan', async () => {
		const { tabId } = await createDocument(main, 'VERSI-LAMA')
		const versions = await apiJson<Array<{ id: string }>>(main.url, `/api/v1/tabs/${tabId}/versions`)
		const writer = peer(main, tabId, (await ticketFor(main, tabId)).ticket, {
			seed: seedFrom('VERSI-LAMA'),
			reconnect: false,
		})
		await writer.ready()
		writer.type('ditulis-setelah')
		await waitFor(async () => (await serverContent(main, tabId)).includes('ditulis-setelah'), 'turunan')

		await apiJson(main.url, `/api/v1/tabs/${tabId}/versions/${versions[0].id}/restore`, { method: 'POST' })
		await waitFor(
			() => writer.closes.some((close) => close.code === COLLAB_CLOSE.epoch),
			'klien diputus 4409',
		)
		expect(await headRows(tabId)).toBe(0)
		expect(await serverContent(main, tabId)).not.toContain('ditulis-setelah')

		// Salinan lama ditolak; klien bersih menyemai ulang dari isi server.
		const stale = peer(main, tabId, (await ticketFor(main, tabId)).ticket, {
			epoch: writer.lastStatus?.epoch ?? randomUUID(),
			reconnect: false,
		})
		await waitFor(() => stale.closes.length > 0, 'salinan basi ditolak')
		expect(stale.closes[0]).toEqual({ code: COLLAB_CLOSE.epoch, reason: 'epoch:' })
		const fresh = peer(main, tabId, (await ticketFor(main, tabId)).ticket, { seed: seedFrom('VERSI-LAMA') })
		await fresh.ready()
		expect(fresh.text).toBe('VERSI-LAMA')
	}, 30_000)

	test('menghapus tab memutus kliennya dengan 4404', async () => {
		const created = await apiJson<{ id: string; tabs: Array<{ id: string }> }>(
			main.url,
			'/api/v1/documents',
			{
				method: 'POST',
				body: JSON.stringify({ title: 'IT hapus' }),
			},
		)
		const second = await apiJson<{ id: string }>(main.url, `/api/v1/documents/${created.id}/tabs`, {
			method: 'POST',
			body: JSON.stringify({ title: 'Tab dua' }),
		})
		const writer = peer(main, second.id, (await ticketFor(main, second.id)).ticket, {
			seed: seedFrom('TAB-DUA'),
			reconnect: false,
		})
		await writer.ready()
		await apiJson(main.url, `/api/v1/tabs/${second.id}`, { method: 'DELETE' })
		await waitFor(() => writer.closes.length > 0, 'klien diputus')
		expect(writer.closes[0].code).toBe(COLLAB_CLOSE.gone)
		expect(await headRows(second.id)).toBe(0)
	}, 30_000)
})
