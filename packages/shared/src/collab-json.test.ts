import { describe, expect, test } from 'bun:test'
import * as Y from 'yjs'
import { yFragmentToProseMirrorJSON } from './collab-json'

/*
 * Pengodean di sini meniru y-prosemirror/y-tiptap. Kesetaraan dengan jalur
 * skema sungguhan diuji di apps/web (features/collab/collab-json.test.ts).
 */
describe('Yjs → JSON ProseMirror tanpa skema', () => {
	test('simpul, atribut, teks bermark, dan mark bertumpuk berhash', () => {
		const doc = new Y.Doc()
		const fragment = doc.getXmlFragment('content')
		const heading = new Y.XmlElement('heading')
		heading.setAttribute('level', 2 as unknown as string)
		const title = new Y.XmlText()
		title.insert(0, 'Judul')
		heading.insert(0, [title])

		const paragraph = new Y.XmlElement('paragraph')
		const body = new Y.XmlText()
		paragraph.insert(0, [body])
		const image = new Y.XmlElement('image')
		image.setAttribute('src', 'asset://1')
		fragment.insert(0, [heading, paragraph, image])
		// Seperti y-prosemirror: satu delta per deretan teks, atribut = mark.
		body.applyDelta([
			{ insert: 'tebal', attributes: { bold: {} } },
			{ insert: ' biasa ' },
			{ insert: 'tautan', attributes: { link: { href: 'https://contoh.id', target: null } } },
			{ insert: '!', attributes: { 'comment--AbCd1234': { id: 'k1' } } },
		])

		expect(yFragmentToProseMirrorJSON(fragment)).toEqual({
			type: 'doc',
			content: [
				{ type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Judul' }] },
				{
					type: 'paragraph',
					content: [
						{ type: 'text', text: 'tebal', marks: [{ type: 'bold' }] },
						{ type: 'text', text: ' biasa ' },
						{
							type: 'text',
							text: 'tautan',
							marks: [{ type: 'link', attrs: { href: 'https://contoh.id', target: null } }],
						},
						{ type: 'text', text: '!', marks: [{ type: 'comment', attrs: { id: 'k1' } }] },
					],
				},
				{ type: 'image', attrs: { src: 'asset://1' } },
			],
		})
	})

	test('fragmen kosong menjadi satu paragraf kosong', () => {
		const doc = new Y.Doc()
		expect(yFragmentToProseMirrorJSON(doc.getXmlFragment('content'))).toEqual({
			type: 'doc',
			content: [{ type: 'paragraph' }],
		})
	})
})
