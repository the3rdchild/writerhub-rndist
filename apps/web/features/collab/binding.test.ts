import { describe, expect, test } from 'bun:test'
import { COLLAB_FRAGMENT } from '@writer-hub/shared'
import * as Y from 'yjs'
import { buildSchema, jsonToFragment } from '@/features/sync/serialize'
import { discardedContent, fragmentContent, sameContent } from './backup'
import { bindingKey, bindingOf, handoverDelay, phaseOf, reconcileOnBind } from './binding'
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

	test('aplikasi utama: sesi yang memegang isi tetap terikat saat kolaborasi berhenti (login habis, tidak tersedia)', () => {
		const doc = new Y.Doc()
		for (const phase of ['denied', 'unavailable'] as const) {
			// Suntingan masuk ke Y.Doc sesi (tersimpan di salinan lokalnya) dan
			// terkirim sebagai pembaruan Yjs begitu sesi tersambung lagi.
			expect(bindingOf(fakeSession({ phase, doc }), { keepWhileInactive: true })).toMatchObject({
				kind: 'live',
				doc,
			})
			// Halaman tautan berbagi tidak punya salinan lokal: kembali ke tampilan statis.
			expect(bindingOf(fakeSession({ phase, doc })).kind).toBe('local')
		}
		for (const phase of ['gone', 'destroyed'] as const) {
			expect(bindingOf(fakeSession({ phase, doc }), { keepWhileInactive: true }).kind).toBe('local')
		}
		expect(
			bindingOf(fakeSession({ phase: 'denied', contentReady: false }), { keepWhileInactive: true }).kind,
		).toBe('local')
	})

	test('salinan lokal saat sesi pertama memegang isi: dibawa, dibandingkan, atau aman ditimpa', () => {
		expect(reconcileOnBind({ fresh: true, firstBinding: true, editedLocally: true })).toBe('carry')
		expect(reconcileOnBind({ fresh: false, firstBinding: true, editedLocally: false })).toBe('compare')
		// Sudah pernah tersambung, tetapi disunting saat editor tidak terikat ke sesi.
		expect(reconcileOnBind({ fresh: false, firstBinding: false, editedLocally: true })).toBe('compare')
		expect(reconcileOnBind({ fresh: false, firstBinding: false, editedLocally: false })).toBe('none')
	})

	test('penyerahan tab baru menunggu jeda ketik, tetapi tidak selamanya', () => {
		const base = { readySince: 1_000, quietMs: 700, maxWaitMs: 5_000 }
		expect(handoverDelay({ ...base, now: 1_100, lastEditAt: 1_050 })).toBe(650)
		expect(handoverDelay({ ...base, now: 2_000, lastEditAt: 1_000 })).toBe(0)
		expect(handoverDelay({ ...base, now: 1_100, lastEditAt: 0 })).toBe(0)
		// Mengetik terus: paling lama `maxWaitMs` sejak sesi memegang isi.
		expect(handoverDelay({ ...base, now: 5_800, lastEditAt: 5_790 })).toBe(200)
		expect(handoverDelay({ ...base, now: 6_000, lastEditAt: 5_999 })).toBe(0)
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
