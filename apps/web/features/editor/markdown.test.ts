import { describe, expect, test } from 'bun:test'
import { looksLikeMarkdown, markdownToHtml, toEditorContent } from './markdown'

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

	test('tapi tebal inline dikenali', () => {
		expect(looksLikeMarkdown('Ini **penting** sekali.')).toBe(true)
		expect(markdownToHtml('Ini **penting** sekali.')).toBe('<p>Ini <strong>penting</strong> sekali.</p>')
	})
})

describe('garis mendatar', () => {
	test('--- jadi <hr>', () => {
		expect(markdownToHtml('---')).toBe('<hr>')
		expect(markdownToHtml('atas\n---\nbawah')).toBe('<p>atas</p><hr><p>bawah</p>')
	})

	test('dikenali sebagai Markdown', () => {
		expect(looksLikeMarkdown('atas\n---\nbawah')).toBe(true)
	})

	test('tanda pisah di tengah kalimat bukan garis', () => {
		expect(markdownToHtml('rentang 1---2')).toBe('<p>rentang 1---2</p>')
	})
})

describe('rumus LaTeX', () => {
	test('rumus inline jadi node, bukan teks', () => {
		const html = markdownToHtml('Misalkan $x^2$ berlaku.')
		expect(html).toContain('data-latex="x^2"')
		expect(html).not.toContain('$x^2$')
	})

	test('penanda Markdown di dalam LaTeX tidak ikut diproses', () => {
		const html = markdownToHtml('Rumus $\\alpha*2*\\beta$ saja.')
		expect(html).toContain('data-latex="\\alpha*2*\\beta"')
		expect(html).not.toContain('<em>')
	})

	test('rumus sebaris penuh jadi blok, bukan div di dalam p', () => {
		const html = markdownToHtml('$$\\int_0^1 f(x)dx$$')
		expect(html).toBe('<div data-latex="\\int_0^1 f(x)dx"></div>')
	})

	test('kutip dalam LaTeX di-escape sebagai atribut', () => {
		expect(markdownToHtml('$a"b$')).toContain('&quot;')
	})

	test('harga tidak dijadikan rumus', () => {
		const html = markdownToHtml('Harganya $5 dan $10 saja.')
		expect(html).not.toContain('data-latex')
	})

	test('kalimat berisi rumus dikenali sebagai Markdown', () => {
		expect(looksLikeMarkdown('Nilai $x^2$ naik.')).toBe(true)
		expect(looksLikeMarkdown('Biaya $5 per bulan.')).toBe(false)
	})
})

describe('pembatas LaTeX', () => {
	test('\\(…\\) jadi rumus inline', () => {
		const html = markdownToHtml('Misalkan \\(x^2\\) berlaku.')
		expect(html).toContain('data-latex="x^2"')
		expect(html).not.toContain('\\(')
	})

	test('\\[…\\] sebaris penuh jadi blok', () => {
		expect(markdownToHtml('\\[\\int_0^1 f(x)dx\\]')).toBe('<div data-latex="\\int_0^1 f(x)dx"></div>')
	})

	test('\\[…\\] beberapa baris tetap dikenali', () => {
		const html = markdownToHtml('\\[\n\\int_{-\\infty}^{\\infty} e^{-x^2}\\,dx = \\sqrt{\\pi}\n\\]')
		expect(html).toContain('data-latex="\\int_{-\\infty}^{\\infty} e^{-x^2}\\,dx = \\sqrt{\\pi}"')
	})

	test('lingkungan equation jadi blok', () => {
		expect(markdownToHtml('\\begin{equation}E = mc^2\\end{equation}')).toBe(
			'<div data-latex="E = mc^2"></div>',
		)
	})

	test('$ di dalam \\[…] tidak ikut diproses', () => {
		const html = markdownToHtml('\\[a $ b\\]')
		expect(html).toContain('data-latex="a $ b"')
	})

	test('dikenali sebagai Markdown', () => {
		expect(looksLikeMarkdown('\\(x^2\\)')).toBe(true)
		expect(looksLikeMarkdown('\\[x^2\\]')).toBe(true)
		expect(looksLikeMarkdown('\\begin{equation}x\\end{equation}')).toBe(true)
	})
})

/* Keluaran DeepSeek V4 Flash untuk lembar pengesahan, 26 Sep: entitas dan
 * garis bawah yang di-escape tertulis mentah di naskah. */
describe('entitas HTML dan backslash-escape', () => {
	const SIGNATURE = [
		'## Lembar Pengesahan',
		'',
		'&emsp; &emsp; &emsp; NIP.',
		'',
		'&nbsp;',
		'',
		'Pembimbing I &emsp; &emsp; Pembimbing II',
		'',
		'( \\_\\_\\_\\_ ) &emsp; ( \\_\\_\\_\\_ )',
	].join('\n')

	test('entitas diserahkan ke peramban, tidak di-escape menjadi teks', () => {
		const html = markdownToHtml(SIGNATURE)
		expect(html).toContain('<p>&emsp; &emsp; &emsp; NIP.</p>')
		expect(html).toContain('<p>&nbsp;</p>')
		expect(html).not.toContain('&amp;emsp;')
	})

	test('garis isian yang di-escape menjadi garis bawah, tanpa backslash', () => {
		expect(markdownToHtml(SIGNATURE)).toContain('<p>( ____ ) &emsp; ( ____ )</p>')
	})

	test('penanda yang di-escape tidak memformat', () => {
		expect(markdownToHtml('\\*bukan miring\\* dan \\*\\*bukan tebal\\*\\*')).toBe(
			'<p>*bukan miring* dan **bukan tebal**</p>',
		)
	})

	test('entitas tidak pernah membuka jalan bagi tag', () => {
		expect(markdownToHtml('&lt;script&gt; <b>x</b> R&D')).toBe(
			'<p>&lt;script&gt; &lt;b&gt;x&lt;/b&gt; R&amp;D</p>',
		)
	})

	test('isi kode ditulis apa adanya', () => {
		expect(markdownToHtml('Pakai `&nbsp; \\_` di HTML')).toBe(
			'<p>Pakai <code>&amp;nbsp; \\_</code> di HTML</p>',
		)
	})

	test('dolar yang di-escape bukan rumus, dolar di dalam rumus tetap LaTeX', () => {
		expect(markdownToHtml('Harga \\$5 sampai \\$10')).toBe('<p>Harga $5 sampai $10</p>')
		expect(markdownToHtml('Nilai $a\\$b$ saja')).toContain('data-latex="a\\$b"')
	})

	test('teks polos berisi entitas atau escape ikut dikonversi', () => {
		expect(looksLikeMarkdown('Ttd &emsp; NIP.')).toBe(true)
		expect(looksLikeMarkdown('( \\_\\_\\_ )')).toBe(true)
		expect(toEditorContent('( \\_\\_\\_ )')).toBe('<p>( ___ )</p>')
		expect(looksLikeMarkdown('Riset dan pengembangan (R&D)')).toBe(false)
	})
})

/* Keluaran DeepSeek V4 Flash untuk skripsi lengkap, 26 Sep. */
describe('kebiasaan LaTeX dan penanda bersarang dari model', () => {
	test('\\pagebreak di baris sendiri menjadi pindah halaman, bukan teks', () => {
		const html = markdownToHtml('Penutup bab.\n\\pagebreak\n\n# BAB II TINJAUAN PUSTAKA')
		expect(html).toBe('<p>Penutup bab.</p><div data-page-break=""></div><h1>BAB II TINJAUAN PUSTAKA</h1>')
		expect(markdownToHtml('\\newpage')).toBe('<div data-page-break=""></div>')
	})

	test('\\pagebreak di tengah kalimat tetap teks', () => {
		expect(markdownToHtml('Perintah \\pagebreak di LaTeX **penting**')).not.toContain('data-page-break')
	})

	test('miring di dalam tebal', () => {
		expect(markdownToHtml('**a. Daya Ingat (*Short-Term Memory*)**')).toBe(
			'<p><strong>a. Daya Ingat (<em>Short-Term Memory</em>)</strong></p>',
		)
		expect(markdownToHtml('**3.3.1 Variabel (X): *Brainrot***')).toBe(
			'<p><strong>3.3.1 Variabel (X): <em>Brainrot</em></strong></p>',
		)
	})
})
