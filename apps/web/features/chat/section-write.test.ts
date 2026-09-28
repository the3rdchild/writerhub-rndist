import { describe, expect, test } from 'bun:test'
import type { Node as PMNode } from '@tiptap/pm/model'
import { EditorState } from '@tiptap/pm/state'
import { PAGE_BREAK_NODE } from '@/features/editor/page-break'
import { buildSchema } from '@/features/sync/serialize'
import {
	chapterNumber,
	chapterSlot,
	docHeadings,
	docIsScaffold,
	dropLeadingTitle,
	emptyChapterFor,
	planSectionWrite,
	planTextReplace,
	sameTitle,
	sectionIsEmpty,
} from './section-write'

const schema = buildSchema()
const h = (level: number, text: string) => schema.node('heading', { level }, [schema.text(text)])
const p = (text: string) => schema.node('paragraph', null, text ? [schema.text(text)] : [])
const doc = (...blocks: PMNode[]) => schema.node('doc', null, blocks)

/** Posisi teks di dokumen, seperti hasil `textRangeToPM` untuk `find` itu. */
function rangeOf(root: PMNode, find: string): { from: number; to: number } {
	const parts: { text: string; start: number }[] = []
	root.descendants((node, pos) => {
		if (!node.isTextblock) return true
		parts.push({ text: node.textContent, start: pos + 1 })
		return false
	})
	const joined = parts.map((part) => part.text).join('\n')
	const at = joined.indexOf(find)
	if (at < 0) throw new Error(`tidak ada: ${find}`)
	const toPos = (offset: number, edge: 'from' | 'to') => {
		let seen = 0
		for (const part of parts) {
			const end = seen + part.text.length
			if (offset < end || (edge === 'to' && offset === end) || (edge === 'from' && offset === seen)) {
				return part.start + (offset - seen)
			}
			seen = end + 1
		}
		throw new Error('di luar dokumen')
	}
	return { from: toPos(at, 'from'), to: toPos(at + find.length, 'to') }
}

/** Markdown sederhana → blok: `#` jadi heading, baris lain paragraf. */
function blocksOf(markdown: string): PMNode[] {
	return markdown
		.split(/\n\s*\n/)
		.map((chunk) => chunk.trim())
		.filter(Boolean)
		.map((chunk) => {
			const atx = /^(#{1,6})\s+(.*)$/.exec(chunk)
			return atx ? h(atx[1].length, atx[2]) : p(chunk)
		})
}

/** Kerangka dokumen sebagai baris "H1 judul" / "P isi" / "BREAK". */
function outline(root: PMNode): string[] {
	const lines: string[] = []
	root.forEach((node) => {
		if (node.type.name === 'heading') lines.push(`H${node.attrs.level} ${node.textContent}`)
		else if (node.type.name === PAGE_BREAK_NODE) lines.push('BREAK')
		else lines.push(`P ${node.textContent}`)
	})
	return lines
}

function applyEdits(root: PMNode, edits: { from: number; to: number; markdown: string }[]): PMNode {
	const tr = EditorState.create({ schema, doc: root }).tr
	for (const edit of edits) tr.replaceWith(edit.from, edit.to, blocksOf(edit.markdown))
	return tr.doc
}

const template = () =>
	doc(
		h(1, 'Kata Pengantar'),
		p('[Tuliskan kata pengantar]'),
		h(2, 'Rumusan Masalah'),
		p('[Tuliskan rumusan]'),
	)

describe('replace_text menghormati heading (T3)', () => {
	test('suntingan kecil di dalam paragraf tidak berubah sama sekali', () => {
		const root = template()
		const range = rangeOf(root, 'kata pengantar]')
		expect(planTextReplace(root, range.from, range.to, 'prakata]')).toEqual({
			ok: true,
			...range,
			markdown: 'prakata]',
		})
	})

	test('judul diulang di awal pengganti: heading ditulis ulang, isi menjadi paragraf di bawahnya', () => {
		const root = template()
		const range = rangeOf(root, 'Kata Pengantar\n[Tuliskan kata pengantar]')
		const plan = planTextReplace(
			root,
			range.from,
			range.to,
			'Kata Pengantar\n\nPuji syukur.\n\nParagraf kedua.',
		)
		if (!plan.ok) throw new Error(plan.message)

		expect(plan.markdown.startsWith('# Kata Pengantar\n')).toBe(true)
		expect(outline(applyEdits(root, [plan]))).toEqual([
			'H1 Kata Pengantar',
			'P Puji syukur.',
			'P Paragraf kedua.',
			'H2 Rumusan Masalah',
			'P [Tuliskan rumusan]',
		])
	})

	test('pengganti tanpa judul: judulnya tetap, bukan tertimpa isi', () => {
		const root = template()
		const range = rangeOf(root, 'Kata Pengantar\n[Tuliskan kata pengantar]')
		const plan = planTextReplace(root, range.from, range.to, 'Puji syukur.\n\nParagraf kedua.')
		if (!plan.ok) throw new Error(plan.message)

		expect(outline(applyEdits(root, [plan]))).toEqual([
			'H1 Kata Pengantar',
			'P Puji syukur.',
			'P Paragraf kedua.',
			'H2 Rumusan Masalah',
			'P [Tuliskan rumusan]',
		])
	})

	test('subjudul di tengah rentang yang diulang sebagai baris polos tetap heading', () => {
		const root = template()
		const range = rangeOf(root, '[Tuliskan kata pengantar]\nRumusan Masalah\n[Tuliskan rumusan]')
		const plan = planTextReplace(
			root,
			range.from,
			range.to,
			'Puji syukur.\n\nRumusan Masalah\n\nIsi rumusan.',
		)
		if (!plan.ok) throw new Error(plan.message)

		expect(outline(applyEdits(root, [plan]))).toEqual([
			'H1 Kata Pengantar',
			'P Puji syukur.',
			'H2 Rumusan Masalah',
			'P Isi rumusan.',
		])
	})

	test('tingkat heading mengikuti dokumen, dan judul tebal pun dikenali', () => {
		const root = template()
		const range = rangeOf(root, '[Tuliskan kata pengantar]\nRumusan Masalah\n[Tuliskan rumusan]')
		const bold = planTextReplace(root, range.from, range.to, 'Puji.\n\n**Rumusan Masalah**\n\nIsi.')
		const wrongLevel = planTextReplace(root, range.from, range.to, 'Puji.\n\n# Rumusan Masalah\n\nIsi.')

		expect(bold.ok && bold.markdown).toContain('\n## Rumusan Masalah\n')
		expect(wrongLevel.ok && wrongLevel.markdown).toContain('\n## Rumusan Masalah\n')
	})

	test('subjudul di tengah rentang yang tidak diulang: ditolak, bukan dihapus diam-diam', () => {
		const root = template()
		const range = rangeOf(root, '[Tuliskan kata pengantar]\nRumusan Masalah\n[Tuliskan rumusan]')
		const plan = planTextReplace(root, range.from, range.to, 'Satu paragraf pengganti.\n\nDan satu lagi.')

		expect(plan.ok).toBe(false)
		expect(!plan.ok && plan.message).toContain('"Rumusan Masalah"')
	})

	test('rentang yang berakhir di judul berikutnya tanpa mengulangnya: judul itu tetap', () => {
		const root = template()
		const range = rangeOf(root, '[Tuliskan kata pengantar]\nRumusan Masalah')
		const plan = planTextReplace(root, range.from, range.to, 'Puji syukur.')
		if (!plan.ok) throw new Error(plan.message)

		const tr = EditorState.create({ schema, doc: root }).tr.insertText(plan.markdown, plan.from, plan.to)
		expect(outline(tr.doc)).toEqual([
			'H1 Kata Pengantar',
			'P Puji syukur.',
			'H2 Rumusan Masalah',
			'P [Tuliskan rumusan]',
		])
	})

	test('rentang yang berhenti di tengah judul yang diulang: ditolak', () => {
		const root = template()
		const range = rangeOf(root, '[Tuliskan kata pengantar]\nRumusan')
		const plan = planTextReplace(root, range.from, range.to, 'Puji.\n\nRumusan Masalah\n\nIsi.')

		expect(plan.ok).toBe(false)
	})

	test('judul saja diganti judul + isi: heading tetap satu, isi di bawahnya', () => {
		const root = template()
		const range = rangeOf(root, 'Kata Pengantar')
		const plan = planTextReplace(root, range.from, range.to, 'Kata Pengantar\n\nPuji syukur.')
		if (!plan.ok) throw new Error(plan.message)

		expect(outline(applyEdits(root, [plan])).slice(0, 3)).toEqual([
			'H1 Kata Pengantar',
			'P Puji syukur.',
			'P [Tuliskan kata pengantar]',
		])
	})

	test('seluruh paragraf diganti dua paragraf: blok utuh yang ditimpa', () => {
		const root = template()
		const range = rangeOf(root, '[Tuliskan kata pengantar]')
		const plan = planTextReplace(root, range.from, range.to, 'Satu.\n\nDua.')
		if (!plan.ok) throw new Error(plan.message)

		expect(plan.from).toBe(range.from - 1)
		expect(plan.to).toBe(range.to + 1)
		expect(outline(applyEdits(root, [plan]))).toEqual([
			'H1 Kata Pengantar',
			'P Satu.',
			'P Dua.',
			'H2 Rumusan Masalah',
			'P [Tuliskan rumusan]',
		])
	})
})

const skripsi = () =>
	doc(
		h(1, 'BAB I PENDAHULUAN'),
		p('[pengantar bab]'),
		h(2, '1.1 Latar Belakang'),
		p('[latar]'),
		h(2, '1.2 Rumusan Masalah'),
		p('[rumusan]'),
		schema.node(PAGE_BREAK_NODE),
		h(1, 'BAB II TINJAUAN PUSTAKA'),
		p('[tinjauan]'),
	)

function written(root: PMNode, at: number, markdown: string): string[] {
	const plan = planSectionWrite(root, at, markdown)
	if (!plan.ok) throw new Error(plan.message)
	return outline(applyEdits(root, plan.edits))
}

describe('write_section: isi di bawah heading, kerangka tidak digandakan', () => {
	test('isi tanpa subjudul menggantikan isi bab itu sendiri; subbab dibiarkan', () => {
		expect(written(skripsi(), 0, 'Bab ini menguraikan latar penelitian.')).toEqual([
			'H1 BAB I PENDAHULUAN',
			'P Bab ini menguraikan latar penelitian.',
			'H2 1.1 Latar Belakang',
			'P [latar]',
			'H2 1.2 Rumusan Masalah',
			'P [rumusan]',
			'BREAK',
			'H1 BAB II TINJAUAN PUSTAKA',
			'P [tinjauan]',
		])
	})

	test('judul bab yang diulang di awal dibuang, bukan menjadi heading kedua', () => {
		expect(written(skripsi(), 0, '# BAB I PENDAHULUAN\n\nPengantar.').slice(0, 3)).toEqual([
			'H1 BAB I PENDAHULUAN',
			'P Pengantar.',
			'H2 1.1 Latar Belakang',
		])
	})

	test('subjudul yang diulang mengisi subbab yang ada, termasuk yang ditulis tebal', () => {
		const plan = planSectionWrite(
			skripsi(),
			0,
			'Pengantar.\n\n## 1.1 Latar Belakang\n\nIsi latar.\n\n**1.2 Rumusan Masalah**\n\nIsi rumusan.',
		)
		if (!plan.ok) throw new Error(plan.message)

		expect(plan.filled).toEqual(['1.1 Latar Belakang', '1.2 Rumusan Masalah'])
		expect(plan.added).toEqual([])
		expect(outline(applyEdits(skripsi(), plan.edits))).toEqual([
			'H1 BAB I PENDAHULUAN',
			'P Pengantar.',
			'H2 1.1 Latar Belakang',
			'P Isi latar.',
			'H2 1.2 Rumusan Masalah',
			'P Isi rumusan.',
			'BREAK',
			'H1 BAB II TINJAUAN PUSTAKA',
			'P [tinjauan]',
		])
	})

	test('subbab baru mendarat sesudah subbab terakhir yang cocok, sebelum pindah halaman', () => {
		const plan = planSectionWrite(
			skripsi(),
			0,
			'## 1.2 Rumusan Masalah\n\nIsi rumusan.\n\n# 1.3 Tujuan\n\nIsi tujuan.\n\n## 1.4 Manfaat\n\nIsi manfaat.',
		)
		if (!plan.ok) throw new Error(plan.message)

		expect(plan.added).toEqual(['1.3 Tujuan', '1.4 Manfaat'])
		expect(outline(applyEdits(skripsi(), plan.edits))).toEqual([
			'H1 BAB I PENDAHULUAN',
			'P [pengantar bab]',
			'H2 1.1 Latar Belakang',
			'P [latar]',
			'H2 1.2 Rumusan Masalah',
			'P Isi rumusan.',
			// "# 1.3" diturunkan: subbab baru tetap di bawah BAB I.
			'H2 1.3 Tujuan',
			'P Isi tujuan.',
			'H2 1.4 Manfaat',
			'P Isi manfaat.',
			'BREAK',
			'H1 BAB II TINJAUAN PUSTAKA',
			'P [tinjauan]',
		])
	})

	test('subbab tanpa isi yang lalu diikuti subbab baru: urutannya tetap', () => {
		const root = doc(h(1, 'BAB III METODE'), h(2, '3.1 Desain'), h(1, 'BAB IV HASIL'))
		expect(written(root, 0, '## 3.1 Desain\n\nIsi desain.\n\n## 3.2 Sampel\n\nIsi sampel.')).toEqual([
			'H1 BAB III METODE',
			'H2 3.1 Desain',
			'P Isi desain.',
			'H2 3.2 Sampel',
			'P Isi sampel.',
			'H1 BAB IV HASIL',
		])
	})

	test('subjudul yang ditulis tidak berurutan tetap mengisi subbabnya sendiri', () => {
		const plan = planSectionWrite(
			skripsi(),
			0,
			'## 1.2 Rumusan Masalah\n\nIsi rumusan.\n\n## 1.1 Latar Belakang\n\nIsi latar.',
		)
		if (!plan.ok) throw new Error(plan.message)

		expect(plan.added).toEqual([])
		expect(outline(applyEdits(skripsi(), plan.edits)).slice(2, 6)).toEqual([
			'H2 1.1 Latar Belakang',
			'P Isi latar.',
			'H2 1.2 Rumusan Masalah',
			'P Isi rumusan.',
		])
	})

	test('subbab yang ditulis dengan isi kosong tidak menghapus isinya', () => {
		const plan = planSectionWrite(
			skripsi(),
			0,
			'## 1.1 Latar Belakang\n\n## 1.2 Rumusan Masalah\n\nIsi rumusan.',
		)
		if (!plan.ok) throw new Error(plan.message)

		expect(outline(applyEdits(skripsi(), plan.edits)).slice(2, 6)).toEqual([
			'H2 1.1 Latar Belakang',
			'P [latar]',
			'H2 1.2 Rumusan Masalah',
			'P Isi rumusan.',
		])
	})

	test('isi kosong ditolak', () => {
		expect(planSectionWrite(skripsi(), 0, '# BAB I PENDAHULUAN').ok).toBe(false)
		// Paragraf kosong yang bisa dibuang bukan berarti ada yang ditulis.
		expect(planSectionWrite(doc(h(1, 'Metode'), p('')), 0, '# Metode').ok).toBe(false)
	})

	test('hanya subbab: paragraf kosong template di bawah heading dibuang', () => {
		const root = doc(h(1, 'Metode'), p(''), p(''), h(1, 'Daftar Pustaka'))
		expect(written(root, 0, '## 2.1 Desain\n\nIsi desain.')).toEqual([
			'H1 Metode',
			'H2 2.1 Desain',
			'P Isi desain.',
			'H1 Daftar Pustaka',
		])
	})

	test('hanya subbab: isi yang sudah ada di bawah heading tidak disentuh', () => {
		expect(written(skripsi(), 0, '## 1.1 Latar Belakang\n\nIsi latar.').slice(0, 4)).toEqual([
			'H1 BAB I PENDAHULUAN',
			'P [pengantar bab]',
			'H2 1.1 Latar Belakang',
			'P Isi latar.',
		])
	})
})

describe('insert_content tidak menggandakan bab kosong (N5)', () => {
	const journal = () =>
		doc(
			h(1, 'Abstrak'),
			p('Isi abstrak.'),
			h(1, 'Pendahuluan'),
			p(''),
			h(1, 'Metode'),
			p(''),
			h(1, 'Daftar Pustaka'),
		)

	test('bab tingkat 1 yang ada dan kosong ditemukan', () => {
		expect(emptyChapterFor(journal(), '# Pendahuluan\n\nIsi.')).toBe(1)
		expect(emptyChapterFor(journal(), '\n## PENDAHULUAN\n\nIsi.')).toBe(1)
	})

	test('bab yang sudah berisi, judul yang tidak ada, atau tanpa judul di awal: tidak dialihkan', () => {
		expect(emptyChapterFor(journal(), '# Abstrak\n\nIsi baru.')).toBeNull()
		expect(emptyChapterFor(journal(), '# Pembahasan\n\nIsi.')).toBeNull()
		expect(emptyChapterFor(journal(), 'Paragraf lepas.\n\n# Pendahuluan')).toBeNull()
	})

	test('bagian kosong: termasuk subbabnya, dan paragraf kosong tidak dihitung isi', () => {
		expect(sectionIsEmpty(doc(h(1, 'BAB I'), p(''), h(2, '1.1'), p(''), h(1, 'BAB II')), 0)).toBe(true)
		expect(sectionIsEmpty(doc(h(1, 'BAB I'), p(''), h(2, '1.1'), p('isi'), h(1, 'BAB II')), 0)).toBe(false)
	})

	test('judul kembar atau subjudul: tidak dialihkan', () => {
		const twins = doc(h(1, 'Pendahuluan'), h(1, 'Pendahuluan'))
		const nested = doc(h(1, 'BAB I'), h(2, 'Kesimpulan'), h(1, 'BAB II'), h(2, 'Kesimpulan'), p('isi'))
		expect(emptyChapterFor(twins, '# Pendahuluan\n\nIsi.')).toBeNull()
		expect(emptyChapterFor(nested, '## Kesimpulan\n\nIsi.')).toBeNull()
	})
})

describe('pembantu judul', () => {
	test('sameTitle mengabaikan spasi, huruf besar, tebal, dan titik dua penutup', () => {
		expect(sameTitle('Kata Pengantar', '  KATA   pengantar ')).toBe(true)
		expect(sameTitle('Kata Pengantar', '**Kata Pengantar**:')).toBe(true)
		expect(sameTitle('1.1 Latar Belakang', 'Latar Belakang')).toBe(false)
	})

	test('dropLeadingTitle hanya membuang judul yang sama di baris pertama', () => {
		expect(dropLeadingTitle('# Metode\n\nIsi.', 'Metode')).toBe('Isi.')
		expect(dropLeadingTitle('\nMetode\n\n\nIsi.', 'Metode')).toBe('Isi.')
		expect(dropLeadingTitle('# Hasil\n\nIsi.', 'Metode')).toBe('# Hasil\n\nIsi.')
		expect(dropLeadingTitle('Metode penelitian ini kualitatif.', 'Metode')).toBe(
			'Metode penelitian ini kualitatif.',
		)
	})

	test('docHeadings hanya judul tingkat atas, dengan posisi node-nya', () => {
		const root = template()
		expect(
			docHeadings(root).map((heading) => [heading.level, heading.text, root.nodeAt(heading.pos)?.type.name]),
		).toEqual([
			[1, 'Kata Pengantar', 'heading'],
			[2, 'Rumusan Masalah', 'heading'],
		])
	})
})

describe('bab bernomor menurut urutannya (ED-3)', () => {
	const pb = () => schema.node(PAGE_BREAK_NODE)
	/* Bentuk UC2, 27 Sep: skripsi tanpa BAB IV, bab dipisah pemenggal halaman. */
	const skripsi = () =>
		doc(
			h(1, 'BAB I PENDAHULUAN'),
			p('Latar.'),
			pb(),
			h(1, 'BAB II TINJAUAN PUSTAKA'),
			p('Teori.'),
			pb(),
			h(1, 'BAB III METODE'),
			h(2, '3.1 Desain'),
			p('Desain.'),
			pb(),
			h(1, 'BAB V PENUTUP'),
			p('Simpulan.'),
			pb(),
			h(1, 'DAFTAR PUSTAKA'),
			p('Rujukan.'),
			h(1, 'LAMPIRAN'),
		)

	test('nomor romawi dan angka', () => {
		expect(chapterNumber('BAB IV HASIL DAN PEMBAHASAN')).toBe(4)
		expect(chapterNumber('Bab 12 Penutup')).toBe(12)
		expect(chapterNumber('**BAB IX**')).toBe(9)
		expect(chapterNumber('DAFTAR PUSTAKA')).toBeNull()
		expect(chapterNumber('Babak baru')).toBeNull()
	})

	test('BAB IV mendarat sesudah seluruh BAB III, bukan di akhir dokumen', () => {
		const root = skripsi()
		const slot = chapterSlot(root, '# BAB IV HASIL DAN PEMBAHASAN\n\nIsi hasil.')
		expect(slot?.kind).toBe('insert')
		if (slot?.kind !== 'insert') return
		expect(slot.side).toBe('after')
		expect(slot.neighbour).toBe('BAB III METODE')
		// Sesudah "Desain.", sebelum pemenggal yang menutup BAB III.
		expect(root.resolve(slot.pos).nodeBefore?.textContent).toBe('Desain.')
		expect(root.resolve(slot.pos).nodeAfter?.type.name).toBe(PAGE_BREAK_NODE)
		expect(slot.markdown.startsWith('\\pagebreak')).toBe(true)
	})

	test('pemenggal yang sudah ditulis model tidak digandakan', () => {
		const slot = chapterSlot(skripsi(), '\\pagebreak\n\n# BAB IV HASIL\n\nIsi.')
		expect(slot?.kind === 'insert' && slot.markdown).toBe('\\pagebreak\n\n# BAB IV HASIL\n\nIsi.')
	})

	test('bab tanpa pendahulu masuk sebelum bab bernomor berikutnya', () => {
		const root = doc(h(1, 'KATA PENGANTAR'), p('Puji.'), pb(), h(1, 'BAB II TEORI'), p('x'))
		const slot = chapterSlot(root, '# BAB I PENDAHULUAN\n\nLatar.')
		expect(slot?.kind === 'insert' && slot.side).toBe('before')
		if (slot?.kind !== 'insert') return
		expect(root.resolve(slot.pos).nodeAfter?.textContent).toBe('BAB II TEORI')
		expect(slot.markdown.endsWith('\\pagebreak')).toBe(true)
	})

	test('nomor yang sudah ada: diisi bila kosong, dilaporkan bila berisi', () => {
		const root = doc(h(1, 'BAB I PENDAHULUAN'), p('Latar.'), h(1, 'BAB II HASIL PENELITIAN'), p(''))
		const empty = chapterSlot(root, '# BAB II HASIL DAN PEMBAHASAN\n\nIsi baru.')
		expect(empty).toEqual({
			kind: 'existing',
			index: 1,
			empty: true,
			title: 'BAB II HASIL PENELITIAN',
			body: 'Isi baru.',
		})
		expect(chapterSlot(root, '# BAB I LAIN\n\nx')).toMatchObject({ kind: 'existing', empty: false })
	})

	test('dokumen tanpa bab bernomor, atau sisipan bukan bab: aturan lama', () => {
		expect(chapterSlot(doc(h(1, 'Pendahuluan'), p('x')), '# BAB II\n\ny')).toBeNull()
		expect(chapterSlot(skripsi(), '## 3.2 Sampel\n\nIsi.')).toBeNull()
		expect(chapterSlot(skripsi(), 'Paragraf biasa.')).toBeNull()
	})
})

describe('docIsScaffold: kerangka dibandingkan dengan template asal (UC5)', () => {
	/** Template Flyer A4: H1 + H2 dengan placeholder kosong. */
	const flyerTemplate = () =>
		doc(h(1, 'Flyer'), h(2, 'Judul'), p(''), h(2, 'Isi'), p(''), h(1, 'Kontak'), p(''))

	test('dokumen sama persis dengan template: true', () => {
		expect(docIsScaffold(flyerTemplate(), flyerTemplate())).toBe(true)
	})

	test('dokumen dengan teks yang berbeda dari template: false', () => {
		const changed = doc(
			h(1, 'Flyer'),
			h(2, 'Judul'),
			p('Judul Baru'),
			h(2, 'Isi'),
			p(''),
			h(1, 'Kontak'),
			p(''),
		)
		expect(docIsScaffold(changed, flyerTemplate())).toBe(false)
	})

	test('dokumen dengan heading utama yang berbeda: false', () => {
		const changed = doc(h(1, 'Flyer Lain'), h(2, 'Judul'), p(''), h(2, 'Isi'), p(''), h(1, 'Kontak'), p(''))
		expect(docIsScaffold(changed, flyerTemplate())).toBe(false)
	})

	test('dokumen hanya H2 tanpa H1: false', () => {
		expect(docIsScaffold(doc(h(2, 'Catatan rapat'), p('Isi penting')), flyerTemplate())).toBe(false)
	})

	test('paragraf sebelum heading pertama yang berbeda: false', () => {
		const changed = doc(
			p('Paragraf pembuka'),
			h(1, 'Flyer'),
			h(2, 'Judul'),
			p(''),
			h(2, 'Isi'),
			p(''),
			h(1, 'Kontak'),
			p(''),
		)
		expect(docIsScaffold(changed, flyerTemplate())).toBe(false)
	})

	test('paragraf sebelum heading pertama yang kosong: true', () => {
		const changed = doc(p(''), h(1, 'Flyer'), h(2, 'Judul'), p(''), h(2, 'Isi'), p(''), h(1, 'Kontak'), p(''))
		expect(docIsScaffold(changed, flyerTemplate())).toBe(true)
	})

	test('tanpa template: false (tidak menggantikan apa pun)', () => {
		expect(docIsScaffold(flyerTemplate(), null)).toBe(false)
		expect(docIsScaffold(flyerTemplate(), undefined)).toBe(false)
	})
	/* Isi asli template Flyer A4, dari /api/v1/templates/flyer-a4 (28 Sep). */
	const FLYER_A4 = {
		type: 'doc',
		content: [
			{ type: 'heading', attrs: { level: 1 }, content: [{ text: 'Headline Utama', type: 'text' }] },
			{ type: 'heading', attrs: { level: 2 }, content: [{ text: 'Subheadline Pendukung', type: 'text' }] },
			{ type: 'heading', attrs: { level: 2 }, content: [{ text: 'Visual Utama', type: 'text' }] },
			{
				type: 'paragraph',
				content: [{ text: 'Sisipkan gambar utama di sini.', type: 'text', marks: [{ type: 'italic' }] }],
			},
			{ type: 'heading', attrs: { level: 2 }, content: [{ text: '3 Manfaat', type: 'text' }] },
			{
				type: 'orderedList',
				content: [
					{
						type: 'listItem',
						content: [{ type: 'paragraph', content: [{ text: 'Manfaat pertama', type: 'text' }] }],
					},
					{
						type: 'listItem',
						content: [{ type: 'paragraph', content: [{ text: 'Manfaat kedua', type: 'text' }] }],
					},
					{
						type: 'listItem',
						content: [{ type: 'paragraph', content: [{ text: 'Manfaat ketiga', type: 'text' }] }],
					},
				],
			},
			{ type: 'heading', attrs: { level: 2 }, content: [{ text: 'Ajakan Bertindak', type: 'text' }] },
			{ type: 'heading', attrs: { level: 2 }, content: [{ text: 'Kontak', type: 'text' }] },
		],
	} as const
	const flyer = (
		edit: (blocks: Record<string, unknown>[]) => Record<string, unknown>[] = (blocks) => blocks,
	) =>
		schema.nodeFromJSON({
			type: 'doc',
			content: edit(structuredClone(FLYER_A4.content) as Record<string, unknown>[]),
		})
	const para = (text: string) => ({ type: 'paragraph', content: [{ type: 'text', text }] })

	test('template Flyer A4 yang asli dan belum disentuh: kerangka', () => {
		expect(docIsScaffold(flyer(), flyer())).toBe(true)
	})

	/* Tinjauan 28 Sep: versi pertama menganggap semua ini kerangka, dan menghapusnya. */
	test('kerangka ditambah tabel karya penulis: bukan kerangka', () => {
		const table = {
			type: 'table',
			content: [{ type: 'tableRow', content: [{ type: 'tableCell', content: [para('Rp 500.000')] }] }],
		}
		expect(
			docIsScaffold(
				flyer((blocks) => [...blocks, table]),
				flyer(),
			),
		).toBe(false)
	})

	test('daftar manfaat yang sudah diubah penulis: bukan kerangka', () => {
		const edited = flyer((blocks) =>
			blocks.map((block) =>
				block.type === 'orderedList'
					? {
							type: 'orderedList',
							content: [{ type: 'listItem', content: [para('Kelas kecil, maksimal 8 orang')] }],
						}
					: block,
			),
		)
		expect(docIsScaffold(edited, flyer())).toBe(false)
	})

	test('kerangka ditambah flyer lama atau gambar: bukan kerangka', () => {
		const design = { type: 'htmlBlock', attrs: { html: '<div>flyer lama</div>', fit: 'page' } }
		const image = { type: 'image', attrs: { src: 'https://contoh.id/foto.png' } }
		expect(
			docIsScaffold(
				flyer((blocks) => [...blocks, design]),
				flyer(),
			),
		).toBe(false)
		expect(
			docIsScaffold(
				flyer((blocks) => [...blocks, image]),
				flyer(),
			),
		).toBe(false)
	})
})
