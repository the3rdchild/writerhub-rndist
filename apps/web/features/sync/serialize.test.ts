import { describe, expect, test } from 'bun:test'
import type { JSONContent } from '@tiptap/core'
import * as Y from 'yjs'
import { createTab, tabFragment, tabPreview } from '@/features/sessions/ydoc'
import { fragmentToJSON, jsonToFragment } from './serialize'

/** JSON → fragmen → JSON, pada dokumen baru. */
function roundTrip(json: JSONContent): JSONContent {
	const doc = new Y.Doc()
	const tabId = createTab(doc)
	jsonToFragment(doc, tabId, json)
	return fragmentToJSON(doc, tabId)
}

/**
 * Skema editor menambahkan attrs bawaan (indentasi, spasi blok) ke node yang
 * tidak menyebutkannya, jadi JSON hasil baca bukan fotokopi persis JSON yang
 * ditulis. Jaminan yang berarti adalah titik-tetap: begitu naskah melewati
 * skema sekali, bolak-balik berikutnya tidak mengubah apa-apa lagi. Tanpa itu,
 * tiap autosave bisa menulis naskah yang makin berbeda dari asalnya.
 */
describe('serialisasi naskah ke JSON', () => {
	test('teks sederhana mencapai titik-tetap', () => {
		const json: JSONContent = {
			type: 'doc',
			content: [
				{
					type: 'paragraph',
					content: [{ type: 'text', text: 'Halo dunia' }],
				},
			],
		}

		const sekali = roundTrip(json)
		expect(roundTrip(sekali)).toEqual(sekali)
		expect(sekali.content?.[0].content).toEqual([{ type: 'text', text: 'Halo dunia' }])
	})

	test('tebal dan miring ikut tersimpan', () => {
		const hasil = roundTrip({
			type: 'doc',
			content: [
				{
					type: 'paragraph',
					content: [
						{ type: 'text', text: 'biasa ' },
						{ type: 'text', marks: [{ type: 'bold' }], text: 'tebal' },
						{ type: 'text', marks: [{ type: 'italic' }], text: ' miring' },
					],
				},
			],
		})

		expect(roundTrip(hasil)).toEqual(hasil)
		expect(hasil.content?.[0].content).toEqual([
			{ type: 'text', text: 'biasa ' },
			{ type: 'text', marks: [{ type: 'bold' }], text: 'tebal' },
			{ type: 'text', marks: [{ type: 'italic' }], text: ' miring' },
		])
	})

	test('menulis ulang mengganti isi lama, bukan menambahinya', () => {
		const doc = new Y.Doc()
		const tabId = createTab(doc)
		jsonToFragment(doc, tabId, {
			type: 'doc',
			content: [{ type: 'paragraph', content: [{ type: 'text', text: 'naskah lama' }] }],
		})

		jsonToFragment(doc, tabId, {
			type: 'doc',
			content: [{ type: 'paragraph', content: [{ type: 'text', text: 'naskah baru' }] }],
		})

		expect(tabPreview(doc, tabId)).toBe('naskah baru')
	})

	test('fragmen kosong dibaca sebagai dokumen kosong yang sah', () => {
		const doc = new Y.Doc()
		const tabId = createTab(doc)

		expect(tabFragment(doc, tabId).length).toBe(0)
		expect(fragmentToJSON(doc, tabId)).toEqual({
			type: 'doc',
			content: [{ type: 'paragraph' }],
		})
	})
})
