import { describe, expect, test } from 'bun:test'
import { COLLAB_FRAGMENT } from '@writer-hub/shared'
import * as Y from 'yjs'
import { buildSchema, jsonToFragment } from '@/features/sync/serialize'
import { discardedContent, fragmentContent, sameContent } from './backup'
import { bindingKey, bindingOf, phaseOf } from './binding'
import { RICH_DOCUMENT } from './fixtures'
import { seedUpdateFromFragment, seedUpdateFromJSON } from './seed'
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

	test('sesi yang belum memegang isi: tunggu, hanya-baca - kecuali luring, salinan lokal seperti dulu', () => {
		expect(bindingOf(fakeSession({ phase: 'connecting', contentReady: false })).kind).toBe('pending')
		expect(bindingOf(fakeSession({ phase: 'waiting', contentReady: false })).kind).toBe('pending')
		expect(bindingOf(fakeSession({ phase: 'offline', contentReady: false })).kind).toBe('local')
	})

	test('salinan kolaborasi dimuat tanpa sambungan: terikat, tanpa kursor kolaborator; kunci ikut berganti', () => {
		const doc = new Y.Doc()
		const offline = bindingOf(fakeSession({ phase: 'offline', provider: null, user: null, doc }))
		expect(offline).toMatchObject({ kind: 'live', provider: null, doc })
		const online = bindingOf(fakeSession({ phase: 'synced', doc }))
		expect(bindingKey(offline)).not.toBe(bindingKey(online))
		expect(bindingKey(online)).toBe(bindingKey(bindingOf(fakeSession({ phase: 'offline', doc }))))
		expect(bindingKey({ kind: 'pending' })).toBe('pending')
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

	/*
	 * Perbandingan salinan lokal vs isi server saat tab pertama kali tersambung
	 * harus menganggap isi yang sama SAMA, dari jalur mana pun ia dibangun -
	 * kalau tidak, setiap tab yang pertama kali tersambung memicu cadangan palsu.
	 */
	test('isi yang sama dari Y.Doc besar, semaian salinan, dan semaian JSON dibandingkan sama', () => {
		const big = new Y.Doc()
		jsonToFragment(big, 'tab-lokal', RICH_DOCUMENT)
		const fromFragment = new Y.Doc()
		Y.applyUpdate(fromFragment, seedUpdateFromFragment(big.getXmlFragment('tab-lokal')))
		const fromJson = docWith(RICH_DOCUMENT)

		const local = JSON.stringify(fragmentContent(big.getXmlFragment('tab-lokal'), schema))
		expect(JSON.stringify(fragmentContent(fromFragment.getXmlFragment(COLLAB_FRAGMENT), schema))).toBe(local)
		expect(JSON.stringify(fragmentContent(fromJson.getXmlFragment(COLLAB_FRAGMENT), schema))).toBe(local)

		const fragment = fromJson.getXmlFragment(COLLAB_FRAGMENT)
		const paragraph = new Y.XmlElement('paragraph')
		paragraph.insert(0, [new Y.XmlText('berbeda')])
		fragment.insert(fragment.length, [paragraph])
		expect(JSON.stringify(fragmentContent(fragment, schema))).not.toBe(local)
	})

	test('paragraf penutup kosong tidak membuat dua salinan dianggap berbeda', () => {
		const text = { type: 'paragraph', content: [{ type: 'text', text: 'sama' }] }
		expect(
			sameContent({ type: 'doc', content: [text] }, { type: 'doc', content: [text, { type: 'paragraph' }] }),
		).toBe(true)
		expect(sameContent({ type: 'doc', content: [text] }, { type: 'doc', content: [] })).toBe(false)
	})

	test('simpul yang tidak dikenal skema tetap ikut tercadangkan (isi mentah)', () => {
		const doc = new Y.Doc()
		const unknown = new Y.XmlElement('simpulAsing')
		unknown.insert(0, [new Y.XmlText('tetap ada')])
		doc.getXmlFragment(COLLAB_FRAGMENT).insert(0, [unknown])
		expect(JSON.stringify(discardedContent(doc, schema))).toContain('tetap ada')
	})
})
