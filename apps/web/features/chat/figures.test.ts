import { describe, expect, test } from 'bun:test'
import type { Node as PMNode } from '@tiptap/pm/model'
import { EditorState } from '@tiptap/pm/state'
import { markdownToHtml } from '@/features/editor/markdown'
import { buildSchema } from '@/features/sync/serialize'
import {
	figureLine,
	figureOf,
	insideFigure,
	keepFigures,
	parseFigureLine,
	placeFigures,
	readableText,
	svgInProse,
} from './figures'
import { blockSummary, htmlCandidates } from './html-block-candidates'

const schema = buildSchema()
const h = (level: number, text: string) => schema.node('heading', { level }, [schema.text(text)])
const p = (text: string) => schema.node('paragraph', null, text ? [schema.text(text)] : [])
const doc = (...blocks: PMNode[]) => schema.node('doc', null, blocks)

/* Bentuk diagram dari `draw_diagram`, seperti di naskah UC1 27 Sep. */
const SVG =
	'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 940 420"><title>Tren Nilai Transaksi</title><rect width="100%" height="100%" fill="#f5f5f5"/><line x1="100" y1="420" x2="940" y2="420" stroke="rgba(45,49,66,0.2)"/><circle cx="100" cy="330" r="5"/></svg>'
const diagram = (svg = SVG) => schema.node('codeBlock', { language: 'diagram' }, [schema.text(svg)])
const code = (text: string, language: string) => schema.node('codeBlock', { language }, [schema.text(text)])

const chapter = () =>
	doc(
		h(1, 'Pendahuluan'),
		p('Paragraf satu.'),
		p('Gambar 1. Tren nilai transaksi'),
		diagram(),
		p('Paragraf dua.'),
		h(1, 'Metode'),
		p('Isi metode.'),
	)

describe('figureOf', () => {
	test('diagram, mermaid, rancangan, dan gambar dikenali beserta judulnya', () => {
		expect(figureOf(diagram())).toEqual({ kind: 'diagram', title: 'Tren Nilai Transaksi' })
		expect(figureOf(code('flowchart TD\n  title Alur Sistem\n  A-->B', 'mermaid'))).toEqual({
			kind: 'mermaid diagram',
			title: 'Alur Sistem',
		})
		expect(
			figureOf(
				schema.node('htmlBlock', { html: '<section><h1>Poster <b>Aksi</b></h1></section>', fit: 'page' }),
			),
		).toEqual({ kind: 'full-page design', title: 'Poster Aksi' })
		expect(figureOf(schema.node('image', { src: 'https://x/y.png', alt: 'Peta "lokasi"' }))).toEqual({
			kind: 'image',
			title: "Peta 'lokasi'",
		})
	})

	test('blok kode biasa dan paragraf bukan gambar', () => {
		expect(figureOf(code('<div>contoh</div>', 'html'))).toBeNull()
		expect(figureOf(p('teks'))).toBeNull()
	})

	test('baris gambar bisa dibaca kembali', () => {
		const line = figureLine({ kind: 'diagram', title: 'Tren' })
		expect(line).toBe('[Figure: diagram "Tren"]')
		expect(parseFigureLine(line)).toEqual({ remove: false, kind: 'diagram', title: 'Tren' })
		expect(parseFigureLine('[Delete figure: image]')).toEqual({ remove: true, kind: 'image', title: '' })
		expect(parseFigureLine('Lihat [Figure: diagram] di atas.')).toBeNull()
	})
})

describe('readableText', () => {
	test('sumber SVG tidak pernah sampai ke model; gambarnya satu baris', () => {
		const text = readableText(chapter())
		expect(text).not.toContain('<rect')
		expect(text).toBe(
			[
				'Pendahuluan',
				'Paragraf satu.',
				'Gambar 1. Tren nilai transaksi',
				'[Figure: diagram "Tren Nilai Transaksi"]',
				'Paragraf dua.',
				'Metode',
				'Isi metode.',
			].join('\n'),
		)
	})

	test('tanpa gambar, sama persis dengan textBetween', () => {
		const plain = doc(h(1, 'Judul'), p('Satu.'), p(''), p('Dua.'))
		expect(readableText(plain)).toBe(plain.textBetween(0, plain.content.size, '\n', ' '))
		expect(readableText(plain, 3, 12)).toBe(plain.textBetween(3, 12, '\n', ' '))
	})

	test('mode omit untuk menghitung kata', () => {
		expect(readableText(chapter(), 0, chapter().content.size, 'omit')).not.toContain('Figure')
	})
})

describe('diagram bukan HTML yang belum dirender', () => {
	test('htmlCandidates melewati diagram, get_outline tidak menyuruh mengonversinya', () => {
		const state = chapter()
		expect(htmlCandidates(state)).toHaveLength(0)
		const summary = blockSummary(state)
		expect(summary).toContain('1 diagram')
		expect(summary).not.toContain('NOT rendered')
		expect(summary).toContain('[Figure: …]')
	})

	test('blok kode HTML sungguhan tetap kandidat', () => {
		const state = doc(p('x'), code('<section><h1>Aksi</h1></section>', 'html'), diagram())
		expect(htmlCandidates(state)).toHaveLength(1)
		expect(blockSummary(state)).toContain('NOT rendered')
	})
})

/** Menerapkan rencana seperti `insertContentAt`: tiap blok Markdown menjadi paragraf. */
function apply(root: PMNode, from: number, to: number, markdown: string) {
	const plan = keepFigures(root, from, to, markdown)
	const blocks = plan.markdown
		.split(/\n\s*\n/)
		.map((block) => block.trim())
		.filter(Boolean)
		.map((block) => p(block))
	const tr = EditorState.create({ doc: root }).tr.replaceWith(from, to, blocks)
	placeFigures(tr, plan.slots)
	const shape: string[] = []
	tr.doc.forEach((node) => {
		shape.push(figureOf(node) ? '[diagram]' : node.textContent)
	})
	return { plan, shape }
}

/** Isi bagian pertama: sesudah heading sampai heading kedua. */
function bodyOf(root: PMNode) {
	const first = root.child(0)
	let to = first.nodeSize
	for (let index = 1; index < root.childCount && root.child(index).type.name !== 'heading'; index += 1)
		to += root.child(index).nodeSize
	return { from: first.nodeSize, to }
}

describe('suntingan teks tidak menghapus gambar', () => {
	test('gambar yang barisnya tidak ditulis disimpan di akhir bagian', () => {
		const root = chapter()
		const { from, to } = bodyOf(root)
		const { plan, shape } = apply(root, from, to, 'Ringkas satu.\n\nRingkas dua.')
		expect(plan.appended).toBe(1)
		expect(shape).toEqual([
			'Pendahuluan',
			'Ringkas satu.',
			'Ringkas dua.',
			'[diagram]',
			'Metode',
			'Isi metode.',
		])
	})

	test('baris gambar menentukan tempatnya, sesudah keterangannya', () => {
		const root = chapter()
		const { from, to } = bodyOf(root)
		const { plan, shape } = apply(
			root,
			from,
			to,
			'Baru.\n\nGambar 1. Tren nilai transaksi\n[Figure: diagram "Tren Nilai Transaksi"]\n\nPenutup.',
		)
		expect(plan.appended).toBe(0)
		expect(shape).toEqual([
			'Pendahuluan',
			'Baru.',
			'Gambar 1. Tren nilai transaksi',
			'[diagram]',
			'Penutup.',
			'Metode',
			'Isi metode.',
		])
	})

	test('dua diagram: dipasangkan lewat judul, bukan urutan baris', () => {
		const second = SVG.replace('Tren Nilai Transaksi', 'Sebaran Responden')
		const root = doc(h(1, 'Hasil'), diagram(), p('Antara.'), diagram(second), h(1, 'Akhir'))
		const { from, to } = bodyOf(root)
		const plan = keepFigures(
			root,
			from,
			to,
			'[Figure: diagram "Sebaran Responden"]\n\nAntara.\n\n[Figure: diagram "Tren Nilai Transaksi"]',
		)
		expect(plan.slots.map((slot) => figureOf(slot.node)?.title)).toEqual([
			'Sebaran Responden',
			'Tren Nilai Transaksi',
		])
	})

	test('[Delete figure: …] menghapus; baris gambar asing dibuang, bukan dicetak', () => {
		const root = chapter()
		const { from, to } = bodyOf(root)
		const removed = apply(root, from, to, 'Teks saja.\n\n[Delete figure: diagram "Tren Nilai Transaksi"]')
		expect(removed.plan.removed).toBe(1)
		expect(removed.shape).toEqual(['Pendahuluan', 'Teks saja.', 'Metode', 'Isi metode.'])

		const foreign = keepFigures(root, 1, 1, 'Baru.\n\n[Figure: image "Peta"]')
		expect(foreign.ignored).toBe(1)
		expect(foreign.markdown).toBe('Baru.')
	})

	test('pengganti sebaris tanpa gambar tidak disentuh sama sekali', () => {
		const root = chapter()
		expect(keepFigures(root, 3, 8, ' kata ').markdown).toBe(' kata ')
	})

	test('posisi di dalam sumber SVG dikenali', () => {
		const root = chapter()
		let diagramPos = 0
		root.forEach((node, pos) => {
			if (figureOf(node)) diagramPos = pos
		})
		expect(insideFigure(root, diagramPos + 5)).toBe(true)
		expect(insideFigure(root, 3)).toBe(false)
	})
})

describe('markup yang tidak boleh menjadi naskah', () => {
	test('SVG di prosa ditolak, contoh kode yang dipagari boleh', () => {
		expect(svgInProse('Gambar 1 <rect width="100%"/> <line x1="1"/> <circle r="2"/>')).toBe(true)
		expect(svgInProse('Teks\n\n<svg viewBox="0 0 1 1"></svg>')).toBe(true)
		expect(svgInProse('Contoh:\n\n```svg\n<svg><rect/><line/><circle/></svg>\n```')).toBe(false)
		expect(svgInProse('Elemen `<svg>` dan `<rect>` dipakai untuk grafik.')).toBe(false)
		expect(svgInProse('Nilai a < b dan c > d.')).toBe(false)
	})

	test('komentar HTML tidak tercetak', () => {
		expect(markdownToHtml('Gambar 2. Infografis\n\n<!--diagram:infografis-->\n\nLanjut.')).toBe(
			'<p>Gambar 2. Infografis</p><p>Lanjut.</p>',
		)
		expect(markdownToHtml('Teks <!-- catatan --> lanjut.')).toBe('<p>Teks lanjut.</p>')
		expect(markdownToHtml('Pakai `<!-- x -->` di HTML')).toBe(
			'<p>Pakai <code>&lt;!-- x --&gt;</code> di HTML</p>',
		)
	})
})
