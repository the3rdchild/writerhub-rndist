import { describe, expect, test } from 'bun:test'
import { headingTitle, markdownToDoc, singleHtmlBlock } from './markdown-doc'

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

const FLYER = ['```html', '<div style="height:100%">Aksi</div>', '```'].join('\n')

describe('rancangan satu halaman', () => {
	test('jawaban satu pagar html menjadi blok rancangan', () => {
		const doc = markdownToDoc(FLYER, { allowHtmlBlock: true })

		expect(doc.content).toHaveLength(1)
		expect(doc.content[0].type).toBe('htmlBlock')
		expect(doc.content[0].attrs?.fit).toBe('page')
		expect(doc.content[0].attrs?.html).toBe('<div style="height:100%">Aksi</div>')
	})

	/*
	 * Judul di depan dibiarkan lewat karena model sering tetap menuliskannya.
	 * Ia tidak hilang - `headingTitle` memungutnya sebagai judul dokumen - tapi
	 * ia tidak boleh ikut sebagai node, karena blok mode halaman mengisi satu
	 * lembar penuh dan apa pun di atasnya mendorongnya ke lembar kedua.
	 */
	test('judul di depan dipungut sebagai judul, bukan sebagai node', () => {
		const source = `# Aksi Demo\n\n${FLYER}`
		const doc = markdownToDoc(source, { allowHtmlBlock: true })

		expect(doc.content).toHaveLength(1)
		expect(doc.content[0].type).toBe('htmlBlock')
		expect(headingTitle(source)).toBe('Aksi Demo')
	})

	test('tanpa izin, pagar html tetap jadi blok kode', () => {
		const doc = markdownToDoc(FLYER)

		expect(doc.content[0].type).toBe('codeBlock')
		expect(doc.content[0].attrs?.language).toBe('html')
	})

	/*
	 * Batas yang paling penting: artikel yang MEMBICARAKAN HTML adalah dokumen,
	 * dan potongannya harus tetap jadi blok kode. Menebak lebih agresif berarti
	 * sesekali menelan naskah pengguna ke dalam bingkai terkurung. Prosa SEBELUM
	 * pagar tetap membatalkan seluruhnya - pengantar adalah wajah artikel.
	 */
	test('prosa sebelum pagar membatalkannya', () => {
		const doc = markdownToDoc(`Contohnya begini:\n\n${FLYER}`, { allowHtmlBlock: true })
		expect(doc.content.some((node) => node.type === 'htmlBlock')).toBe(false)
	})

	/*
	 * T3 (docs/DRAFTS-API-FINDINGS.md): dulu SATU kalimat penutup dari model
	 * menjatuhkan seluruh rancangan jadi dokumen penuh blok kode. Basa-basi
	 * pendek antar/setelah pagar kini ditoleransi - strukturnya (heading,
	 * tabel, daftar) dan total yang melewati batas tetap membatalkan.
	 */
	test('basa-basi pendek setelah pagar ditoleransi', () => {
		const doc = markdownToDoc(`${FLYER}\n\nSemoga membantu!`, { allowHtmlBlock: true })
		expect(doc.content).toHaveLength(1)
		expect(doc.content[0].type).toBe('htmlBlock')
	})

	test('penutup yang terstruktur tetap membatalkan', () => {
		const doc = markdownToDoc(`${FLYER}\n\n## Catatan\n\nBegitulah cara kerjanya.`, {
			allowHtmlBlock: true,
		})
		expect(doc.content.some((node) => node.type === 'htmlBlock')).toBe(false)
	})

	test('penutup panjang tetap membatalkan', () => {
		const longClosing = 'Begitulah cara kerjanya. '.repeat(10)
		const doc = markdownToDoc(`${FLYER}\n\n${longClosing}`, { allowHtmlBlock: true })
		expect(doc.content.some((node) => node.type === 'htmlBlock')).toBe(false)
	})

	test('dua pagar bukan SATU rancangan - tapi dua halaman satu rancangan', () => {
		expect(singleHtmlBlock(`${FLYER}\n\n${FLYER}`)).toBeNull()
	})

	test('pagar yang tidak pernah ditutup ditolak', () => {
		expect(singleHtmlBlock('```html\n<div>separuh')).toBeNull()
	})

	test('bahasa lain bukan rancangan', () => {
		expect(singleHtmlBlock('```js\nalert(1)\n```')).toBeNull()
	})

	test('pagar html kosong ditolak', () => {
		expect(singleHtmlBlock('```html\n\n```')).toBeNull()
	})
})

describe('rancangan banyak halaman (T2)', () => {
	/*
	 * "Flyer 3 halaman" dulu dijawab satu lembar dengan sisa isi terpotong -
	 * angkanya tidak punya pembaca sama sekali. Kini tiap pagar ```html jadi
	 * satu blok mode halaman berurutan.
	 */
	test('tiga pagar menjadi tiga blok mode halaman berurutan', () => {
		const source = ['# Aksi Tiga Lembar', '', FLYER, '', FLYER, '', FLYER].join('\n')
		const doc = markdownToDoc(source, { allowHtmlBlock: true })

		expect(doc.content).toHaveLength(3)
		expect(doc.content.every((node) => node.type === 'htmlBlock')).toBe(true)
		expect(doc.content.every((node) => node.attrs?.fit === 'page')).toBe(true)
	})

	test('halaman kosong di tengah dilewati, bukan membatalkan', () => {
		const empty = ['```html', '', '```'].join('\n')
		const doc = markdownToDoc(`${FLYER}\n\n${empty}\n\n${FLYER}`, { allowHtmlBlock: true })

		expect(doc.content).toHaveLength(2)
	})

	test('pagar bahasa lain di antara halaman membatalkan - itu artikel', () => {
		const js = ['```js', 'alert(1)', '```'].join('\n')
		const doc = markdownToDoc(`${FLYER}\n\n${js}\n\n${FLYER}`, { allowHtmlBlock: true })

		expect(doc.content.some((node) => node.type === 'htmlBlock')).toBe(false)
	})

	test('judul tetap dipungut sebagai judul dokumen', () => {
		const source = `# Aksi Tiga Lembar\n\n${FLYER}\n\n${FLYER}`
		const doc = markdownToDoc(source, { allowHtmlBlock: true })

		expect(doc.content).toHaveLength(2)
		expect(headingTitle(source)).toBe('Aksi Tiga Lembar')
	})
})

describe('rancangan tanpa pagar', () => {
	/*
	 * Kegagalan yang melahirkan cabang ini: model yang diminta membalas dengan
	 * satu pagar justru langsung menuliskan `<!DOCTYPE html>`. Ditolak, naskah
	 * itu jatuh ke pengurai Markdown dan mendarat sebagai paragraf demi
	 * paragraf berisi tag - persis yang tersimpan di dokumen pengguna.
	 */
	test('HTML telanjang tetap dikenali sebagai rancangan', () => {
		const doc = markdownToDoc('<section style="height:100%">Aksi</section>', {
			allowHtmlBlock: true,
		})

		expect(doc.content).toHaveLength(1)
		expect(doc.content[0].type).toBe('htmlBlock')
	})

	test('prosa biasa tidak ikut tertarik', () => {
		expect(singleHtmlBlock('Ini paragraf biasa tentang <html>.')).toBeNull()
		expect(singleHtmlBlock('# Judul\n\nParagraf pertama.')).toBeNull()
	})

	test('tag tanpa penutup bukan rancangan', () => {
		expect(singleHtmlBlock('<br>')).toBeNull()
	})
})

describe('dokumen HTML utuh diratakan', () => {
	/*
	 * Bingkai blok menyediakan doctype, html, head dan body-nya sendiri, jadi
	 * dokumen utuh yang disisipkan apa adanya menghasilkan body bersarang di
	 * dalam body.
	 */
	const FULL = [
		'<!DOCTYPE html>',
		'<html lang="id">',
		'<head><meta charset="UTF-8"><style>.t{color:red}</style></head>',
		'<body style="height:100%"><h1>Aksi</h1></body>',
		'</html>',
	].join('\n')

	test('hanya isi body yang tersisa, plus gaya dari head', () => {
		const html = singleHtmlBlock(FULL)

		expect(html).toContain('.t{color:red}')
		expect(html).toContain('<h1>Aksi</h1>')
		expect(html).not.toContain('<!DOCTYPE')
		expect(html).not.toContain('<body')
		expect(html).not.toContain('<head')
	})

	test('atribut body diselamatkan sebagai pembungkus', () => {
		expect(singleHtmlBlock(FULL)).toContain('<div style="height:100%">')
	})

	test('potongan yang memang sudah tanpa body dibiarkan utuh', () => {
		expect(singleHtmlBlock('<div class="flyer">isi</div>')).toBe('<div class="flyer">isi</div>')
	})
})
