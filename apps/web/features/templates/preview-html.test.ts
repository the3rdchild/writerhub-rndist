import { describe, expect, test } from 'bun:test'
import { contentToPreviewHtml } from './preview-html'

describe('contentToPreviewHtml', () => {
	test('heading dan paragraf dengan marka dirender', () => {
		const html = contentToPreviewHtml({
			type: 'doc',
			content: [
				{
					type: 'heading',
					attrs: { level: 1 },
					content: [{ type: 'text', text: 'BAB I Pendahuluan' }],
				},
				{
					type: 'paragraph',
					content: [
						{ type: 'text', text: 'Teks ' },
						{ type: 'text', text: 'tebal', marks: [{ type: 'bold' }] },
						{ type: 'text', text: ' dan ' },
						{ type: 'text', text: 'miring', marks: [{ type: 'italic' }] },
					],
				},
			],
		})

		expect(html).toBe('<h1>BAB I Pendahuluan</h1><p>Teks <strong>tebal</strong> dan <em>miring</em></p>')
	})

	test('tabel dan daftar dirender sebagai HTML semantik', () => {
		const html = contentToPreviewHtml({
			type: 'doc',
			content: [
				{
					type: 'table',
					content: [
						{
							type: 'tableRow',
							content: [
								{ type: 'tableHeader', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Kolom' }] }] },
								{ type: 'tableCell', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Isi' }] }] },
							],
						},
					],
				},
				{
					type: 'bulletList',
					content: [
						{ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'satu' }] }] },
					],
				},
			],
		})

		expect(html).toContain('<table><tr><th><p>Kolom</p></th><td><p>Isi</p></td></tr></table>')
		expect(html).toContain('<ul><li><p>satu</p></li></ul>')
	})

	test('teks berbahaya lolos escape', () => {
		const html = contentToPreviewHtml({
			type: 'doc',
			content: [
				{ type: 'paragraph', content: [{ type: 'text', text: '<script>alert("x")</script>' }] },
			],
		})

		expect(html).not.toContain('<script>')
		expect(html).toContain('&lt;script&gt;')
	})

	test('section break tampak sebagai pemisah, bukan teks mentah', () => {
		const html = contentToPreviewHtml({
			type: 'doc',
			content: [
				{ type: 'paragraph', content: [{ type: 'text', text: 'depan' }] },
				{ type: 'sectionBreak', attrs: { pageSetup: null, columns: { count: 2 }, continuous: true } },
				{ type: 'paragraph', content: [{ type: 'text', text: 'belakang' }] },
			],
		})

		expect(html).toBe('<p>depan</p><hr class="section-break"><p>belakang</p>')
	})
})
