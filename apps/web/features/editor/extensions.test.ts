import { describe, expect, test } from 'bun:test'
import { getSchema } from '@tiptap/core'
import { buildEditorExtensions } from './extensions'

/**
 * Skema editor harus mempertahankan atribut dasar node image.
 *
 * ImageWithMarkdown menambahkan width/height lewat addAttributes; kalau ia
 * tidak memanggil this.parent(), atribut src/alt/title bawaan Tiptap akan
 * hilang, dan gambar yang diimpor dari DOCX (berupa data URL) jadi kotak kosong
 * tanpa isi.
 */
describe('image schema', () => {
	test('node image membawa atribut src, alt, title, width, dan height', () => {
		const schema = getSchema(buildEditorExtensions({}))
		const imageNode = schema.nodes.image

		expect(imageNode).toBeDefined()
		expect(Object.keys(imageNode?.spec.attrs ?? {})).toContain('src')
		expect(Object.keys(imageNode?.spec.attrs ?? {})).toContain('alt')
		expect(Object.keys(imageNode?.spec.attrs ?? {})).toContain('title')
		expect(Object.keys(imageNode?.spec.attrs ?? {})).toContain('width')
		expect(Object.keys(imageNode?.spec.attrs ?? {})).toContain('height')
	})
})
