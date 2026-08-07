import { describe, expect, test } from 'bun:test'
import { decodeShare, encodeShare } from './share-link'

describe('share link', () => {
	test('encode lalu decode mengembalikan muatan asli', () => {
		const payload = {
			version: 1 as const,
			title: 'Proposal Akhir',
			content: {
				type: 'doc' as const,
				content: [{ type: 'paragraph' as const, content: [{ type: 'text' as const, text: 'Halo' }] }],
			},
			access: 'anyone' as const,
			role: 'viewer' as const,
			createdAt: 1_700_000_000_000,
		}
		const hash = encodeShare(payload)
		expect(hash.startsWith('#doc=')).toBe(true)
		expect(decodeShare(hash)).toEqual(payload)
	})

	test('decode hash kosong atau salah mengembalikan null', () => {
		expect(decodeShare('')).toBeNull()
		expect(decodeShare('#doc=not-valid-base64!!!')).toBeNull()
		expect(decodeShare('#other=something')).toBeNull()
	})
})
