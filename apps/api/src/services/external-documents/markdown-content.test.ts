import { describe, expect, test } from 'bun:test'
import { markdownToDocument } from './markdown-content'

type PmNode = {
	type: string
	attrs?: Record<string, unknown>
	content?: PmNode[]
	marks?: { type: string; attrs?: Record<string, unknown> }[]
	text?: string
}

const blocks = (markdown: string) => markdownToDocument(markdown).content as PmNode[]

describe('markdownToDocument', () => {
	test('selalu berbentuk doc', () => {
		expect(markdownToDocument('').type).toBe('doc')
		expect(markdownToDocument('').content).toEqual([])
	})

	test('paragraf biasa menjadi teks polos', () => {
		expect(blocks('Halo dunia')).toEqual([
			{ type: 'paragraph', content: [{ type: 'text', text: 'Halo dunia' }] },
		])
	})

	test('baris lanjutan digabung ke paragraf yang sama', () => {
		expect(blocks('baris satu\nbaris dua')[0].content?.[0].text).toBe('baris satu baris dua')
	})

	test('heading membawa levelnya', () => {
		expect(blocks('### Bagian')[0]).toEqual({
			type: 'heading',
			attrs: { level: 3 },
			content: [{ type: 'text', text: 'Bagian' }],
		})
	})

	test('tebal dan miring menjadi marks', () => {
		const content = blocks('**tebal** dan *miring*')[0].content as PmNode[]
		expect(content[0]).toEqual({ type: 'text', text: 'tebal', marks: [{ type: 'bold' }] })
		expect(content[2]).toEqual({ type: 'text', text: 'miring', marks: [{ type: 'italic' }] })
	})

	test('tautan menjadi mark link dengan href', () => {
		const content = blocks('lihat [situs](https://contoh.id) ini')[0].content as PmNode[]
		expect(content[1]).toEqual({
			type: 'text',
			text: 'situs',
			marks: [{ type: 'link', attrs: { href: 'https://contoh.id' } }],
		})
	})

	test('daftar poin dan nomor menjadi bulletList/orderedList', () => {
		const bullet = blocks('- satu\n- dua')[0]
		expect(bullet.type).toBe('bulletList')
		expect(bullet.content?.map((item) => item.content?.[0].content?.[0].text)).toEqual(['satu', 'dua'])
		expect(blocks('1. satu\n2. dua')[0].type).toBe('orderedList')
	})

	test('kutipan menjadi blockquote', () => {
		const quote = blocks('> baris satu\n> baris dua')[0]
		expect(quote.type).toBe('blockquote')
		expect(quote.content?.[0].content?.[0].text).toBe('baris satu baris dua')
	})

	test('garis pemisah menjadi horizontalRule', () => {
		expect(blocks('atas\n\n---\n\nbawah').map((b) => b.type)).toEqual([
			'paragraph',
			'horizontalRule',
			'paragraph',
		])
	})

	test('blok kode menyimpan bahasa dan isi mentah', () => {
		expect(blocks('```ts\nconst a = 1\n```')[0]).toEqual({
			type: 'codeBlock',
			attrs: { language: 'ts' },
			content: [{ type: 'text', text: 'const a = 1' }],
		})
	})

	test('tabel menjadi table dengan header dan sel rata kanan', () => {
		const table = blocks('| Nama | Nilai |\n| --- | --- |\n| Ani | 90 |')[0]
		expect(table.type).toBe('table')
		expect(table.content?.[0].content?.map((cell) => cell.type)).toEqual(['tableHeader', 'tableHeader'])
		expect(table.content?.[1].content?.[0]).toEqual({
			type: 'tableCell',
			content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Ani' }] }],
		})
	})

	test('matematika menjadi node mathInline dan mathBlock', () => {
		const inline = blocks('Misalkan $x^2$ berlaku.')[0].content as PmNode[]
		expect(inline[1]).toEqual({ type: 'mathInline', attrs: { latex: 'x^2' } })
		expect(blocks('$$\\int_0^1 f(x)dx$$')[0]).toEqual({
			type: 'mathBlock',
			attrs: { latex: '\\int_0^1 f(x)dx' },
		})
	})
})
