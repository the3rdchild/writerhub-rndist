import { describe, expect, test } from 'bun:test'
import { COLLAB_MESSAGE } from '@writer-hub/shared'
import * as decoding from 'lib0/decoding'
import * as encoding from 'lib0/encoding'
import { presenceColor, presenceUser } from './presence'
import { encodeSeedMessage, readStatus } from './protocol'

function statusBytes(json: string): decoding.Decoder {
	const encoder = encoding.createEncoder()
	encoding.writeVarString(encoder, json)
	return decoding.createDecoder(encoding.toUint8Array(encoder))
}

describe('pesan kolaborasi di klien', () => {
	test('seed: varUint(101) lalu pembaruan apa adanya', () => {
		const update = new Uint8Array([1, 2, 3, 4])
		const decoder = decoding.createDecoder(encodeSeedMessage(update))
		expect(decoding.readVarUint(decoder)).toBe(COLLAB_MESSAGE.seed)
		expect([...decoding.readVarUint8Array(decoder)]).toEqual([1, 2, 3, 4])
	})

	test('status dibaca dengan curiga: peran tak dikenal menjadi viewer, readOnly bawaan true', () => {
		expect(
			readStatus(statusBytes('{"state":"ready","epoch":"e1","role":"editor","readOnly":false}')),
		).toEqual({
			state: 'ready',
			epoch: 'e1',
			role: 'editor',
			readOnly: false,
		})
		expect(readStatus(statusBytes('{"state":"waiting","epoch":null,"role":"owner"}'))).toEqual({
			state: 'waiting',
			epoch: null,
			role: 'viewer',
			readOnly: true,
		})
		expect(readStatus(statusBytes('{"state":"lain"}'))).toBeNull()
		expect(readStatus(statusBytes('bukan json'))).toBeNull()
	})
})

describe('kehadiran', () => {
	test('warna stabil per id dan berbeda per kunci sesi', () => {
		expect(presenceColor('u1')).toBe(presenceColor('u1'))
		expect(presenceUser({ id: 'u1', name: '  ' })).toEqual({ name: 'Guest', color: presenceColor('u1:') })
		const colors = new Set(
			['a', 'b', 'c', 'd', 'e', 'f'].map((key) => presenceUser({ id: 'u1', name: 'X' }, key).color),
		)
		expect(colors.size).toBeGreaterThan(1)
	})
})
