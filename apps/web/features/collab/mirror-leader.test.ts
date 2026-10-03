import { describe, expect, test } from 'bun:test'
import { COLLAB_FRAGMENT } from '@writer-hub/shared'
import * as Y from 'yjs'
import { buildSchema, jsonToFragment } from '@/features/sync/serialize'
import { mirrorFragment } from './mirror'
import { holdMirrorLead, type LockRequest } from './mirror-leader'

const schema = buildSchema()

/** Web Locks di memori: satu pemegang per nama, antrean FIFO, permintaan bisa dibatalkan. */
function memoryLocks(): LockRequest {
	const queues = new Map<string, Array<() => void>>()
	const busy = new Set<string>()
	const next = (name: string) => {
		const waiting = queues.get(name)?.shift()
		if (waiting) waiting()
		else busy.delete(name)
	}
	return (name, { signal }, callback) =>
		new Promise((resolve, reject) => {
			const run = () => {
				busy.add(name)
				callback().then(
					() => {
						next(name)
						resolve(undefined)
					},
					(error) => {
						next(name)
						reject(error)
					},
				)
			}
			if (!busy.has(name)) {
				run()
				return
			}
			const queue = queues.get(name) ?? []
			queue.push(run)
			queues.set(name, queue)
			signal.addEventListener('abort', () => {
				const index = queue.indexOf(run)
				if (index >= 0) queue.splice(index, 1)
				reject(new DOMException('aborted', 'AbortError'))
			})
		})
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 0))

describe('giliran mencermin per tab', () => {
	test('hanya satu halaman memegang giliran; yang menunggu mendapatkannya saat dilepas', async () => {
		const locks = memoryLocks()
		const events: string[] = []
		const releaseA = holdMirrorLead('tab', () => void events.push('A'), locks)
		const releaseB = holdMirrorLead('tab', () => void events.push('B'), locks)
		await tick()
		expect(events).toEqual(['A'])
		releaseA()
		await tick()
		expect(events).toEqual(['A', 'B'])
		releaseB()
	})

	test('permintaan yang masih menunggu bisa dibatalkan; tab lain tidak saling menunggu', async () => {
		const locks = memoryLocks()
		const events: string[] = []
		const releaseA = holdMirrorLead('tab', () => void events.push('A'), locks)
		const cancelB = holdMirrorLead('tab', () => void events.push('B'), locks)
		const releaseOther = holdMirrorLead('tab-lain', () => void events.push('lain'), locks)
		await tick()
		cancelB()
		releaseA()
		await tick()
		expect(events).toEqual(['A', 'lain'])
		releaseOther()
	})

	test('tanpa Web Locks giliran langsung didapat', async () => {
		let led = false
		const release = holdMirrorLead(
			'tab',
			() => {
				led = true
			},
			null,
		)
		expect(led).toBe(true)
		release()
	})
})
const TAB = 'tab-lokal'

function paragraphText(doc: Y.Doc, field: string): string {
	return doc
		.getXmlFragment(field)
		.toArray()
		.map((node) => (node instanceof Y.XmlElement ? node.toArray().join('') : String(node)))
		.join('\n')
}

/**
 * Dua halaman (dua tab peramban) dengan salinan Y.Doc besar masing-masing yang
 * tersimpan ke IndexedDB yang SAMA - di sini: satu log pembaruan bersama.
 */
function twoPages() {
	const storage: Uint8Array[] = []
	const base = new Y.Doc()
	jsonToFragment(base, TAB, {
		type: 'doc',
		content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hello world' }] }],
	})
	storage.push(Y.encodeStateAsUpdate(base))
	const page = () => {
		const doc = new Y.Doc()
		for (const update of storage) Y.applyUpdate(doc, update)
		let seen = storage.length
		doc.on('update', (update: Uint8Array, origin: unknown) => {
			if (origin !== 'storage') storage.push(update)
		})
		// Seperti `fetchUpdates` y-indexeddb: ambil yang ditulis halaman lain sejak terakhir dibaca.
		const converge = () => {
			Y.transact(
				doc,
				() => {
					for (const update of storage.slice(seen)) Y.applyUpdate(doc, update)
				},
				'storage',
			)
			seen = storage.length
		}
		return { doc, converge }
	}
	// Room kolaborasi: kedua halaman memegang Y.Doc sesi yang sama isinya.
	const session = new Y.Doc()
	jsonToFragment(session, COLLAB_FRAGMENT, {
		type: 'doc',
		content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hello world' }] }],
	})
	const remoteEdit = () => {
		const text = session.getXmlFragment(COLLAB_FRAGMENT).get(0) as Y.XmlElement
		;(text.get(0) as Y.XmlText).insert('Hello '.length, 'brave ')
	}
	const reload = () => {
		const doc = new Y.Doc()
		for (const update of storage) Y.applyUpdate(doc, update)
		return paragraphText(doc, TAB)
	}
	return { a: page(), b: page(), session, remoteEdit, reload }
}

describe('cermin dari beberapa halaman ke satu IndexedDB', () => {
	test('dua halaman yang sama-sama mencermin perubahan yang sama: isinya ganda setelah muat ulang', () => {
		const { a, b, session, remoteEdit, reload } = twoPages()
		remoteEdit()
		mirrorFragment(session.getXmlFragment(COLLAB_FRAGMENT), a.doc, TAB, schema)
		mirrorFragment(session.getXmlFragment(COLLAB_FRAGMENT), b.doc, TAB, schema)
		// Inilah kerusakan yang dicegah satu-pencermin-per-tab: item Yjs berbeda untuk isi yang sama.
		expect(reload()).toBe('Hello brave brave world')
	})

	test('satu pencermin per tab; pengganti mengejar simpanan dulu sebelum mencermin', () => {
		const { a, b, session, remoteEdit, reload } = twoPages()
		remoteEdit()
		// A memegang giliran; B (pengikut) tidak mencermin sama sekali.
		mirrorFragment(session.getXmlFragment(COLLAB_FRAGMENT), a.doc, TAB, schema)
		// A ditutup; B mendapat giliran, mengejar simpanan, lalu mencermin.
		b.converge()
		mirrorFragment(session.getXmlFragment(COLLAB_FRAGMENT), b.doc, TAB, schema)
		expect(paragraphText(b.doc, TAB)).toBe('Hello brave world')
		expect(reload()).toBe('Hello brave world')
	})
})
