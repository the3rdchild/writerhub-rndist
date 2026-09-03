import { describe, expect, test } from 'bun:test'
import type { Node as PMNode } from '@tiptap/pm/model'
import { buildSchema } from '@/features/sync/serialize'
import { blockSummary, htmlCandidates } from './html-block-candidates'

const schema = buildSchema()

function doc(json: Record<string, unknown>[]): PMNode {
	return schema.nodeFromJSON({ type: 'doc', content: json })
}

const paragraph = (text: string) => ({ type: 'paragraph', content: [{ type: 'text', text }] })
const code = (text: string, language = 'html') => ({
	type: 'codeBlock',
	attrs: { language },
	content: [{ type: 'text', text }],
})

const MARKUP = '<section class="flyer"><h1>Aksi</h1></section>'

describe('htmlCandidates', () => {
	test('blok kode berisi HTML dikenali', () => {
		const found = htmlCandidates(doc([code(MARKUP)]))

		expect(found).toHaveLength(1)
		expect(found[0].source).toBe('codeBlock')
		expect(found[0].html).toBe(MARKUP)
	})

	test('blok kode bahasa lain dilewati', () => {
		expect(htmlCandidates(doc([code('print(1)', 'python')]))).toHaveLength(0)
	})

	/*
	 * Bentuk yang benar-benar tersimpan di dokumen pengguna: HTML yang lewat
	 * pengurai Markdown pecah menjadi satu paragraf per baris.
	 */
	test('deretan paragraf berisi HTML dikumpulkan jadi satu', () => {
		const found = htmlCandidates(
			doc([paragraph('<section class="flyer">'), paragraph('<h1>Aksi</h1>'), paragraph('</section>')]),
		)

		expect(found).toHaveLength(1)
		expect(found[0].source).toBe('blocks')
		expect(found[0].html).toContain('<h1>Aksi</h1>')
	})

	test('prosa biasa bukan kandidat', () => {
		expect(htmlCandidates(doc([paragraph('Ini paragraf biasa.')]))).toHaveLength(0)
	})

	test('teks yang cuma menyebut satu tag bukan kandidat', () => {
		expect(htmlCandidates(doc([paragraph('<br>')]))).toHaveLength(0)
	})

	/*
	 * Rancangan yang pecah menjadi banyak blok harus kalah dari dirinya sendiri
	 * sebagai satu deret utuh - kalau tidak, yang dikonversi cuma sepotong.
	 */
	test('kandidat terpanjang lebih dulu', () => {
		const found = htmlCandidates(
			doc([
				code(MARKUP),
				paragraph('teks pemisah'),
				paragraph('<div class="a">'),
				paragraph('<span>x</span>'),
				paragraph('</div>'),
			]),
		)

		expect(found.length).toBeGreaterThan(1)
		expect(found[0].to - found[0].from).toBeGreaterThanOrEqual(found[1].to - found[1].from)
	})
})

describe('blockSummary', () => {
	test('menyebut jenis blok beserta jumlahnya', () => {
		const summary = blockSummary(doc([paragraph('halo'), paragraph('dunia')]))

		expect(summary).toContain('Blocks:')
		expect(summary).toContain('2 paragraph')
	})

	/*
	 * Perbedaan yang paling sering salah dibaca model: HTML yang SUDAH menjadi
	 * blok rancangan versus HTML yang masih tergeletak sebagai teks.
	 */
	test('menandai HTML yang belum dirender, dan menunjuk alatnya', () => {
		const summary = blockSummary(doc([paragraph('<div class="a">'), paragraph('</div>')]))

		expect(summary).toContain('NOT rendered')
		expect(summary).toContain('convert_to_html_block')
	})

	test('blok rancangan yang sudah jadi tidak ditandai', () => {
		const summary = blockSummary(
			doc([{ type: 'htmlBlock', attrs: { html: MARKUP, fit: 'page', height: 320 } }]),
		)

		expect(summary).toContain('htmlBlock (page)')
		expect(summary).not.toContain('NOT rendered')
	})
})
