import { describe, expect, test } from 'bun:test'
import { COLLAB_FRAGMENT } from '@writer-hub/shared'
import * as Y from 'yjs'
import { buildSchema } from '@/features/sync/serialize'
import { discardedContent } from './backup'
import { bindingOf, phaseOf } from './binding'
import { seedUpdateFromJSON } from './seed'
import type { CollabSession } from './session'

function fakeSession(fields: Partial<CollabSession>): CollabSession {
	return {
		phase: 'synced',
		contentReady: true,
		provider: { awareness: {} },
		user: { name: 'Penulis', color: '#123456' },
		readOnly: false,
		doc: new Y.Doc(),
		...fields,
	} as unknown as CollabSession
}

describe('pengikatan editor ke sesi kolaborasi', () => {
	test('tanpa sesi, atau sesi yang tidak berjalan: salinan lokal seperti dulu', () => {
		expect(bindingOf(null)).toEqual({ kind: 'local' })
		for (const phase of ['unavailable', 'denied', 'gone', 'destroyed'] as const) {
			expect(bindingOf(fakeSession({ phase })).kind).toBe('local')
			expect(phaseOf(fakeSession({ phase }))).toBeNull()
		}
	})

	test('sesi yang belum memegang isi: tunggu, hanya-baca', () => {
		expect(bindingOf(fakeSession({ phase: 'connecting', contentReady: false })).kind).toBe('pending')
		expect(bindingOf(fakeSession({ phase: 'synced', provider: null })).kind).toBe('pending')
	})

	test('sesi yang memegang isi: terikat langsung - juga saat luring - dan mengikuti peran', () => {
		const doc = new Y.Doc()
		const live = bindingOf(fakeSession({ phase: 'offline', doc }))
		expect(live).toMatchObject({ kind: 'live', doc, readOnly: false })
		expect(bindingOf(fakeSession({ readOnly: true }))).toMatchObject({ kind: 'live', readOnly: true })
		expect(phaseOf(fakeSession({ phase: 'offline' }))).toBe('offline')
	})
})

describe('cadangan salinan yang dibuang', () => {
	const schema = buildSchema()

	function docWith(json: Parameters<typeof seedUpdateFromJSON>[0]): Y.Doc {
		const doc = new Y.Doc()
		Y.applyUpdate(doc, seedUpdateFromJSON(json, schema))
		return doc
	}

	test('naskah berisi teks menjadi JSON editor utuh', () => {
		const content = discardedContent(
			docWith({
				type: 'doc',
				content: [{ type: 'paragraph', content: [{ type: 'text', text: 'BELUM TERKIRIM' }] }],
			}),
			schema,
		)
		expect(JSON.stringify(content)).toContain('BELUM TERKIRIM')
		expect(content?.type).toBe('doc')
	})

	test('naskah kosong tidak perlu dicadangkan; gambar tanpa teks tetap dicadangkan', () => {
		expect(discardedContent(new Y.Doc(), schema)).toBeNull()
		expect(discardedContent(docWith({ type: 'doc', content: [{ type: 'paragraph' }] }), schema)).toBeNull()
		const image = discardedContent(
			docWith({ type: 'doc', content: [{ type: 'image', attrs: { src: 'data:image/png;base64,AA==' } }] }),
			schema,
		)
		expect(image?.content?.[0]?.type).toBe('image')
	})

	test('simpul yang tidak dikenal skema tetap ikut tercadangkan (isi mentah)', () => {
		const doc = new Y.Doc()
		const unknown = new Y.XmlElement('simpulAsing')
		unknown.insert(0, [new Y.XmlText('tetap ada')])
		doc.getXmlFragment(COLLAB_FRAGMENT).insert(0, [unknown])
		expect(JSON.stringify(discardedContent(doc, schema))).toContain('tetap ada')
	})
})
