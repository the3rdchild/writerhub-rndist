import type { JSONContent } from '@tiptap/core'

/**
 * Naskah contoh yang menyentuh sebanyak mungkin bagian skema editor: mark
 * bertumpuk (komentar), atribut bersarang, tabel, simpul inline khusus, dan
 * blok buatan sendiri. Dipakai uji konversi Yjs ↔ JSON di fitur kolaborasi.
 */
export const RICH_DOCUMENT: JSONContent = {
	type: 'doc',
	content: [
		{
			type: 'heading',
			attrs: { level: 1, textAlign: 'center' },
			content: [{ type: 'text', text: 'Judul Bab' }],
		},
		{
			type: 'paragraph',
			attrs: { textAlign: 'justify', lineHeight: 1.5, indentFirstLine: 36, keepWithNext: true },
			content: [
				{ type: 'text', text: 'Teks ' },
				{ type: 'text', text: 'tebal', marks: [{ type: 'bold' }] },
				{ type: 'text', text: ' dan ' },
				{ type: 'text', text: 'miring bergaris', marks: [{ type: 'italic' }, { type: 'underline' }] },
				{ type: 'text', text: ' tautan', marks: [{ type: 'link', attrs: { href: 'https://contoh.id' } }] },
				{ type: 'hardBreak' },
				{
					type: 'text',
					text: 'berwarna',
					marks: [{ type: 'textStyle', attrs: { color: '#d00000', fontFamily: 'Georgia' } }],
				},
				{ type: 'text', text: ' H' },
				{ type: 'text', text: '2', marks: [{ type: 'subscript' }] },
				{ type: 'text', text: 'O ' },
				{
					type: 'text',
					text: 'dua komentar',
					marks: [
						{ type: 'comment', attrs: { commentId: 'k1' } },
						{ type: 'comment', attrs: { commentId: 'k2' } },
					],
				},
				{ type: 'mathInline', attrs: { latex: 'E=mc^2' } },
				{ type: 'footnoteRef', attrs: { id: 'f1' } },
			],
		},
		{
			type: 'bulletList',
			content: [
				{
					type: 'listItem',
					content: [{ type: 'paragraph', content: [{ type: 'text', text: 'butir satu' }] }],
				},
				{
					type: 'listItem',
					content: [
						{ type: 'paragraph', content: [{ type: 'text', text: 'butir dua' }] },
						{
							type: 'orderedList',
							attrs: { start: 3 },
							content: [
								{
									type: 'listItem',
									content: [{ type: 'paragraph', content: [{ type: 'text', text: 'anak' }] }],
								},
							],
						},
					],
				},
			],
		},
		{
			type: 'taskList',
			content: [
				{
					type: 'taskItem',
					attrs: { checked: true },
					content: [{ type: 'paragraph', content: [{ type: 'text', text: 'selesai' }] }],
				},
			],
		},
		{ type: 'blockquote', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'kutipan' }] }] },
		{ type: 'codeBlock', attrs: { language: 'ts' }, content: [{ type: 'text', text: 'const x = 1' }] },
		{
			type: 'table',
			content: [
				{
					type: 'tableRow',
					content: [
						{
							type: 'tableHeader',
							attrs: { colwidth: [120] },
							content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Kolom' }] }],
						},
						{
							type: 'tableHeader',
							content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Nilai' }] }],
						},
					],
				},
				{
					type: 'tableRow',
					content: [
						{
							type: 'tableCell',
							attrs: { backgroundColor: '#eeeeee' },
							content: [{ type: 'paragraph', content: [{ type: 'text', text: 'a' }] }],
						},
						{ type: 'tableCell', content: [{ type: 'paragraph', content: [{ type: 'text', text: '1' }] }] },
					],
				},
			],
		},
		{ type: 'image', attrs: { src: 'data:image/png;base64,iVBORw0KGgo=', alt: 'gambar', width: 320 } },
		{ type: 'pageBreak' },
		{
			type: 'callout',
			attrs: { calloutType: 'info', emoji: '💡' },
			content: [{ type: 'paragraph', content: [{ type: 'text', text: 'catatan' }] }],
		},
		{ type: 'mathBlock', attrs: { latex: '\\int_0^1 x\\,dx' } },
		{ type: 'horizontalRule' },
		{ type: 'paragraph' },
	],
}
