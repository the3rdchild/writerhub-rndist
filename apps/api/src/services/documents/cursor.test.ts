import { describe, expect, test } from 'bun:test'
import { decodeDocumentCursor, encodeDocumentCursor } from './cursor'

const id = '029c219f-3004-40a0-936f-e7f0fe4d82d9'

describe('kursor daftar dokumen', () => {
	test('bolak-balik tanpa kehilangan milidetik', () => {
		const updatedAt = new Date('2026-09-30T06:12:45.123Z')
		expect(decodeDocumentCursor(encodeDocumentCursor({ updatedAt, id }))).toEqual({ updatedAt, id })
	})

	test('kursor rusak ditolak, bukan diterjemahkan jadi sesuatu', () => {
		expect(decodeDocumentCursor('bukan-kursor')).toBeNull()
		expect(decodeDocumentCursor(Buffer.from(`abc.${id}`).toString('base64url'))).toBeNull()
		expect(decodeDocumentCursor(Buffer.from('1727676765123.bukan-uuid').toString('base64url'))).toBeNull()
		expect(decodeDocumentCursor('')).toBeNull()
	})
})
