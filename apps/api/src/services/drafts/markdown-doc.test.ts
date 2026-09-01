import { describe, expect, test } from 'bun:test'
import { headingTitle, markdownToDoc } from './markdown-doc'

describe('markdownToDoc', () => {
	test('judul menjadi heading dengan levelnya', () => {
		const doc = markdownToDoc('## Latar belakang')

		expect(doc.content).toEqual([
			{
				type: 'heading',
				attrs: { level: 2 },
				content: [{ type: 'text', text: 'Latar belakang' }],
			},
		])
	})

	test('baris berurutan menyatu jadi satu paragraf', () => {
		const doc = markdownToDoc('Baris pertama\nmasih paragraf yang sama.\n\nParagraf kedua.')

		expect(doc.content).toHaveLength(2)
		expect(doc.content[0]).toEqual({
			type: 'paragraph',
			content: [{ type: 'text', text: 'Baris pertama masih paragraf yang sama.' }],
		})
	})

	test('tebal, miring, kode, dan tautan menjadi mark', () => {
		const doc = markdownToDoc('Ini **tebal**, *miring*, `kode`, dan [tautan](https://contoh.id).')

		expect(doc.content[0].content).toEqual([
			{ type: 'text', text: 'Ini ' },
			{ type: 'text', text: 'tebal', marks: [{ type: 'bold' }] },
			{ type: 'text', text: ', ' },
			{ type: 'text', text: 'miring', marks: [{ type: 'italic' }] },
			{ type: 'text', text: ', ' },
			{ type: 'text', text: 'kode', marks: [{ type: 'code' }] },
			{ type: 'text', text: ', dan ' },
			{ type: 'text', text: 'tautan', marks: [{ type: 'link', attrs: { href: 'https://contoh.id' } }] },
			{ type: 'text', text: '.' },
		])
	})

	test('mark bersarang menumpuk, bukan saling menimpa', () => {
		const doc = markdownToDoc('**tebal dan *miring* sekaligus**')

		expect(doc.content[0].content).toEqual([
			{ type: 'text', text: 'tebal dan ', marks: [{ type: 'bold' }] },
			{ type: 'text', text: 'miring', marks: [{ type: 'bold' }, { type: 'italic' }] },
			{ type: 'text', text: ' sekaligus', marks: [{ type: 'bold' }] },
		])
	})

	test('isi kode inline dibiarkan harfiah', () => {
		const doc = markdownToDoc('Jalankan `a * b * c` dulu.')

		expect(doc.content[0].content?.[1]).toEqual({
			type: 'text',
			text: 'a * b * c',
			marks: [{ type: 'code' }],
		})
	})

	test('garis bawah di tengah identifier bukan penanda miring', () => {
		const doc = markdownToDoc('Kolom user_id dan project_id tetap utuh.')

		expect(doc.content[0].content).toEqual([
			{ type: 'text', text: 'Kolom user_id dan project_id tetap utuh.' },
		])
	})

	test('daftar berpoin dan bernomor memakai node listnya masing-masing', () => {
		const doc = markdownToDoc('- satu\n- dua\n\n1. pertama\n2. kedua')

		expect(doc.content[0].type).toBe('bulletList')
		expect(doc.content[0].content).toHaveLength(2)
		expect(doc.content[0].content?.[0]).toEqual({
			type: 'listItem',
			content: [{ type: 'paragraph', content: [{ type: 'text', text: 'satu' }] }],
		})
		expect(doc.content[1].type).toBe('orderedList')
	})

	test('kutipan berlapis menyatu jadi satu blockquote', () => {
		const doc = markdownToDoc('> baris satu\n> baris dua')

		expect(doc.content[0]).toEqual({
			type: 'blockquote',
			content: [{ type: 'paragraph', content: [{ type: 'text', text: 'baris satu baris dua' }] }],
		})
	})

	test('blok kode berpagar menyimpan bahasa dan isi apa adanya', () => {
		const doc = markdownToDoc('```python\nprint("halo")\n```')

		expect(doc.content[0]).toEqual({
			type: 'codeBlock',
			attrs: { language: 'python' },
			content: [{ type: 'text', text: 'print("halo")' }],
		})
	})

	test('pagar tanpa bahasa memberi language null', () => {
		const doc = markdownToDoc('```\nteks\n```')

		expect(doc.content[0].attrs).toEqual({ language: null })
	})

	test('tabel jadi header plus baris, kolom kurang dilengkapi sel kosong', () => {
		const doc = markdownToDoc('| A | B |\n| --- | --- |\n| satu |')

		expect(doc.content[0].type).toBe('table')
		const [header, row] = doc.content[0].content ?? []
		expect(header.content?.map((cell) => cell.type)).toEqual(['tableHeader', 'tableHeader'])
		expect(row.content).toHaveLength(2)
		expect(row.content?.[1]).toEqual({ type: 'tableCell', content: [{ type: 'paragraph' }] })
	})

	test('garis pemisah menjadi horizontalRule, bukan paragraf', () => {
		const doc = markdownToDoc('atas\n\n---\n\nbawah')

		expect(doc.content.map((node) => node.type)).toEqual(['paragraph', 'horizontalRule', 'paragraph'])
	})

	test('markdown kosong tetap menghasilkan dokumen yang sah', () => {
		expect(markdownToDoc('   \n\n')).toEqual({ type: 'doc', content: [{ type: 'paragraph' }] })
	})
})

describe('headingTitle', () => {
	test('mengambil heading pertama dan membuang penandanya', () => {
		expect(headingTitle('# Rencana **Kuartal** IV\n\nisi')).toBe('Rencana Kuartal IV')
	})

	test('melewati paragraf pembuka sampai menemukan heading', () => {
		expect(headingTitle('sepatah pengantar\n\n## Bagian pertama')).toBe('Bagian pertama')
	})

	test('null kalau tidak ada heading sama sekali', () => {
		expect(headingTitle('cuma paragraf biasa')).toBeNull()
	})
})
