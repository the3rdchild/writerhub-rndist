import { describe, expect, test } from 'bun:test'
import { BUILTIN_TEMPLATES } from './catalog'
import { compileTemplateContent } from './compile'
import { withTocBlocks } from './toc-blocks'

function heading(text: string) {
	return { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text }] }
}

const paragraph = { type: 'paragraph', content: [{ type: 'text', text: 'isi' }] }

describe('blok daftar di kerangka template', () => {
	test('judul Daftar Isi mendapat blok daftar isi tepat di bawahnya', () => {
		const doc = withTocBlocks({ type: 'doc', content: [heading('Daftar Isi'), paragraph] })

		expect(doc.content[1].type).toBe('tocBlock')
		expect(doc.content[1].attrs?.listKind).toBe('isi')
	})

	test('Daftar Tabel dan Daftar Gambar mendapat jenis daftarnya sendiri', () => {
		const doc = withTocBlocks({
			type: 'doc',
			content: [heading('Daftar Tabel'), heading('Daftar Gambar')],
		})

		expect(doc.content.map((node) => node.attrs?.listKind ?? node.type)).toEqual([
			'heading',
			'tabel',
			'heading',
			'gambar',
		])
	})

	test('judul lain tidak disentuh', () => {
		const doc = withTocBlocks({ type: 'doc', content: [heading('BAB I Pendahuluan'), paragraph] })

		expect(doc.content.map((node) => node.type)).toEqual(['heading', 'paragraph'])
	})

	// Pemanggilan ganda tidak boleh menumpuk dua daftar isi di bawah satu judul.
	test('blok yang sudah ada tidak digandakan', () => {
		const once = withTocBlocks({ type: 'doc', content: [heading('Daftar Isi')] })
		const twice = withTocBlocks(once)

		expect(twice.content.filter((node) => node.type === 'tocBlock')).toHaveLength(1)
	})

	test('judul yang tidak ada di kerangka bukan kesalahan', () => {
		const doc = withTocBlocks({ type: 'doc', content: [paragraph] })

		expect(doc.content).toHaveLength(1)
	})
})

describe('katalog bawaan', () => {
	/*
	 * Penjaga bagi kekeliruan yang memunculkan berkas ini: kerangka yang
	 * dikompilasi hanya berisi judul "Daftar Isi" kosong, jadi yang mengisinya
	 * adalah model - dengan mengetik titik-titik dan menebak nomor halaman.
	 */
	test('setiap template berjudul Daftar Isi benar-benar membawa blok daftarnya', () => {
		const berdaftarIsi = BUILTIN_TEMPLATES.filter((template) => template.markdown.includes('# Daftar Isi'))
		expect(berdaftarIsi.length).toBeGreaterThan(0)

		for (const template of berdaftarIsi) {
			const content = compileTemplateContent(template).content
			const blocks = content.filter((node) => node.type === 'tocBlock')

			expect(blocks.length, `${template.slug} tanpa blok daftar isi`).toBeGreaterThan(0)
			expect(
				blocks.some((node) => node.attrs?.listKind === 'isi'),
				template.slug,
			).toBe(true)
		}
	})

	test('blok daftar berdiri tepat sesudah judulnya', () => {
		const skripsi = BUILTIN_TEMPLATES.find((template) => template.slug === 'skripsi-s1')
		if (!skripsi) throw new Error('skripsi-s1 tidak ada di katalog')

		const content = compileTemplateContent(skripsi).content
		const at = content.findIndex((node) => node.attrs?.listKind === 'isi')

		expect(at).toBeGreaterThan(0)
		expect(content[at - 1].type).toBe('heading')
	})
})
