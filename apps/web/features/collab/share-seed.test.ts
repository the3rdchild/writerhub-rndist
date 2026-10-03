import { describe, expect, test } from 'bun:test'
import { COLLAB_FRAGMENT } from '@writer-hub/shared'
import * as Y from 'yjs'
import { buildSchema } from '@/features/sync/serialize'
import { seedFromShare } from './share-seed'

const schema = buildSchema()

function textOf(update: Uint8Array | null): string {
	const doc = new Y.Doc()
	if (update) Y.applyUpdate(doc, update)
	return doc.getXmlFragment(COLLAB_FRAGMENT).toString()
}

const paragraph = (text: string) => ({
	type: 'doc',
	content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
})

describe('semaian dari halaman tautan berbagi', () => {
	test('selalu dari naskah server saat ini, untuk tab yang diminta', async () => {
		const seed = await seedFromShare({
			shareToken: 'tok',
			serverTabId: 'tab-2',
			schema,
			fetchPayload: async (token) => {
				expect(token).toBe('tok')
				return {
					tabs: [
						{ id: 'tab-1', title: '', emoji: null, language: null, layout: null, content: paragraph('LAIN') },
						{
							id: 'tab-2',
							title: '',
							emoji: null,
							language: null,
							layout: null,
							content: paragraph('VERSI-DIPULIHKAN'),
						},
					],
				}
			},
		})
		expect(textOf(seed)).toContain('VERSI-DIPULIHKAN')
		expect(textOf(seed)).not.toContain('LAIN')
	})

	test('tidak bisa mengambil naskah server, atau tabnya tidak ada: tidak menyemai', async () => {
		const failing = await seedFromShare({
			shareToken: 'tok',
			serverTabId: 'tab-1',
			schema,
			fetchPayload: async () => {
				throw new Error('offline')
			},
		})
		expect(failing).toBeNull()
		const missing = await seedFromShare({
			shareToken: 'tok',
			serverTabId: 'tab-x',
			schema,
			fetchPayload: async () => ({ tabs: [] }),
		})
		expect(missing).toBeNull()
	})
})
