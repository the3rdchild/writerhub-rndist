import { describe, expect, test } from 'bun:test'
import { COLLAB_MESSAGE } from '@writer-hub/shared'
import * as decoding from 'lib0/decoding'
import * as encoding from 'lib0/encoding'
import * as syncProtocol from 'y-protocols/sync'
import * as Y from 'yjs'
import {
	decodeBusMessage,
	decodeClientMessage,
	encodeBusMessage,
	encodeSeed,
	encodeStatus,
	encodeSyncStep1,
	encodeSyncUpdate,
} from './protocol'

function docWithText(text: string): Y.Doc {
	const doc = new Y.Doc()
	doc.getText('t').insert(0, text)
	return doc
}

describe('pesan websocket kolaborasi', () => {
	test('status: varUint(100) lalu JSON', () => {
		const bytes = encodeStatus({ state: 'seed', epoch: null, role: 'editor', readOnly: false })
		const decoder = decoding.createDecoder(bytes)
		expect(decoding.readVarUint(decoder)).toBe(COLLAB_MESSAGE.status)
		expect(JSON.parse(decoding.readVarString(decoder))).toEqual({
			state: 'seed',
			epoch: null,
			role: 'editor',
			readOnly: false,
		})
	})

	test('seed dibaca kembali utuh', () => {
		const update = Y.encodeStateAsUpdate(docWithText('naskah awal'))
		const message = decodeClientMessage(encodeSeed(update))
		expect(message.kind).toBe('seed')
		if (message.kind === 'seed') expect([...message.update]).toEqual([...update])
	})

	test('sync step 1 klien membawa state vector-nya', () => {
		const doc = docWithText('abc')
		const message = decodeClientMessage(encodeSyncStep1(doc))
		expect(message.kind).toBe('sync-step1')
		if (message.kind === 'sync-step1') expect([...message.stateVector]).toEqual([...Y.encodeStateVector(doc)])
	})

	test('sync step 2 dan update sama-sama suntingan', () => {
		const doc = docWithText('abc')
		const encoder = encoding.createEncoder()
		encoding.writeVarUint(encoder, COLLAB_MESSAGE.sync)
		syncProtocol.writeSyncStep2(encoder, doc)
		expect(decodeClientMessage(encoding.toUint8Array(encoder)).kind).toBe('sync-update')
		expect(decodeClientMessage(encodeSyncUpdate(Y.encodeStateAsUpdate(doc))).kind).toBe('sync-update')
	})

	test('tipe tak dikenal diabaikan; pesan terpotong melempar', () => {
		const encoder = encoding.createEncoder()
		encoding.writeVarUint(encoder, 77)
		expect(decodeClientMessage(encoding.toUint8Array(encoder))).toEqual({ kind: 'ignored', type: 77 })
		expect(() => decodeClientMessage(new Uint8Array([COLLAB_MESSAGE.sync]))).toThrow()
	})
})

describe('pesan antar-instance', () => {
	test('setiap jenis bolak-balik tanpa berubah', () => {
		const update = Y.encodeStateAsUpdate(docWithText('x'))
		const messages = [
			{ kind: 'update', origin: 'a', epoch: 'e1', update },
			{ kind: 'seeded', origin: 'b', epoch: 'e2', update },
			{ kind: 'awareness', origin: 'c', update },
			{ kind: 'reset', origin: 'd' },
			{ kind: 'gone', origin: 'e' },
			{ kind: 'query-awareness', origin: 'f' },
			{ kind: 'update-ref', origin: 'g', epoch: 'e3', id: 9_007_199_254 },
			{ kind: 'seeded-ref', origin: 'h', epoch: 'e4' },
		] as const
		for (const message of messages) {
			const decoded = decodeBusMessage(encodeBusMessage(message))
			expect(decoded).not.toBeNull()
			expect(JSON.stringify(decoded, (_k, v) => (v instanceof Uint8Array ? [...v] : v))).toBe(
				JSON.stringify(message, (_k, v) => (v instanceof Uint8Array ? [...v] : v)),
			)
		}
	})

	test('sampah menjadi null, bukan galat', () => {
		expect(decodeBusMessage(new Uint8Array([200, 1, 2]))).toBeNull()
		expect(decodeBusMessage(new Uint8Array([]))).toBeNull()
	})
})
