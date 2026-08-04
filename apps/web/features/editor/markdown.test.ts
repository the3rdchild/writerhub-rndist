import { describe, expect, test } from 'bun:test'
import { looksLikeMarkdown, markdownToHtml, toEditorContent } from './markdown'

/**
 * Yang diuji di sini adalah bentuk yang benar-benar dikirim model saat diminta
 * menyusun isi dokumen - terutama tabel pipe, yang sebelumnya masuk ke naskah
 * sebagai paragraf berisi garis tegak.
 */

describe('tabel', () => {
	const TABLE = `| No | Nama | Jabatan |
|----|------|---------|
| 1 | Andi Pratama | Manajer |
| 2 | Siti Rahma | Supervisor |`

	test('jadi tabel sungguhan dengan baris header', () => {
		const html = markdownToHtml(TABLE)
		expect(html).toContain('<table>')
		expect(html).toContain('<th>No</th>')
		expect(html).toContain('<td>Andi Pratama</td>')
	})

	test('jumlah baris datanya sesuai', () => {
		expect(markdownToHtml(TABLE).match(/<tr>/g)).toHaveLength(3) // header + 2 data
	})

	test('sel yang kurang tetap dibuat supaya kolomnya rata', () => {
		const ragged = `| A | B | C |\n|---|---|---|\n| 1 | 2 |`
		const row = markdownToHtml(ragged).split('</tr>')[1]
		expect(row.match(/<td>/g)).toHaveLength(3)
	})

	test('deretan pipa tanpa baris pemisah bukan tabel', () => {
		const html = markdownToHtml('| ini | cuma | teks |')
		expect(html).not.toContain('<table>')
	})
})

describe('blok lain', () => {
	test('heading mengikuti tingkatnya', () => {
		expect(markdownToHtml('### Bagian')).toBe('<h3>Bagian</h3>')
	})

	test('daftar butir dan nomor', () => {
		expect(markdownToHtml('- satu\n- dua')).toBe('<ul><li><p>satu</p></li><li><p>dua</p></li></ul>')
		expect(markdownToHtml('1. satu\n2. dua')).toContain('<ol>')
	})

	test('baris berturut-turut jadi satu paragraf', () => {
		expect(markdownToHtml('baris satu\nbaris dua')).toBe('<p>baris satu baris dua</p>')
	})
})

describe('keamanan', () => {
	test('HTML di dalam Markdown di-escape, bukan diloloskan', () => {
		const html = markdownToHtml('Teks <script>alert(1)</script> biasa')
		expect(html).not.toContain('<script>')
		expect(html).toContain('&lt;script&gt;')
	})

	test('escaping terjadi sebelum penanda inline, jadi tag hasilnya utuh', () => {
		expect(markdownToHtml('**tebal** dan <b>bukan tag</b>')).toContain('<strong>tebal</strong>')
		expect(markdownToHtml('**tebal** dan <b>bukan tag</b>')).toContain('&lt;b&gt;')
	})
})

describe('teks biasa dibiarkan apa adanya', () => {
	test('kalimat pengganti tidak dibungkus HTML', () => {
		const plain = 'Kalimat ini sudah benar dan tidak perlu diubah.'
		expect(looksLikeMarkdown(plain)).toBe(false)
		expect(toEditorContent(plain)).toBe(plain)
	})

	test('tapi tabel dikenali', () => {
		expect(toEditorContent('| a |\n|---|\n| b |')).toContain('<table>')
	})
})
