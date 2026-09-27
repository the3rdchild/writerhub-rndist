import { describe, expect, test } from 'bun:test'
import type { JSONContent } from '@tiptap/core'
import { type BriefChapter, EMPTY_BRIEF, type ResearchBrief } from '@writer-hub/shared'
import { buildSchema } from '@/features/sync/serialize'
import {
	outlineDone,
	outlineForModel,
	outlineForWriter,
	outlineProgress,
	promisedLabel,
} from './outline-check'

const schema = buildSchema()
const doc = (...content: JSONContent[]) => schema.nodeFromJSON({ type: 'doc', content })
const heading = (level: number, text: string): JSONContent => ({
	type: 'heading',
	attrs: { level },
	content: [{ type: 'text', text }],
})
const paragraph = (text: string): JSONContent =>
	text ? { type: 'paragraph', content: [{ type: 'text', text }] } : { type: 'paragraph' }
const table: JSONContent = {
	type: 'table',
	content: [{ type: 'tableRow', content: [{ type: 'tableCell', content: [paragraph('data')] }] }],
}
const diagram: JSONContent = {
	type: 'codeBlock',
	attrs: { language: 'diagram' },
	content: [{ type: 'text', text: '<svg/>' }],
}

const chapter = (title: string, items: string[] = []): BriefChapter => ({
	title,
	summary: '',
	status: 'belum',
	source: 'ai',
	...(items.length > 0 ? { items } : {}),
	at: 1,
})
const brief = (chapters: BriefChapter[], pages?: [number, number]): ResearchBrief => ({
	...EMPTY_BRIEF,
	chapters,
	...(pages ? { plan: { pages, notes: [], at: 1 } } : {}),
})

describe('label janji kerangka', () => {
	test('label dan jenisnya dibaca dari awal janji', () => {
		expect(promisedLabel('Tabel 1: statistik adopsi')).toEqual({ label: 'Tabel 1', kind: 'table' })
		expect(promisedLabel('gambar 1.2 - grafik garis')).toEqual({ label: 'Gambar 1.2', kind: 'figure' })
		expect(promisedLabel('Infografis 1 alur sistem')).toEqual({ label: 'Infografis 1', kind: 'figure' })
		expect(promisedLabel('Ringkasan temuan')).toBeNull()
	})
})

describe('bab kerangka di naskah', () => {
	test('berisi, kosong, dan belum ada - subbab yang berisi membuat babnya berisi', () => {
		const progress = outlineProgress(
			[
				doc(
					heading(1, 'BAB I PENDAHULUAN'),
					heading(2, '1.1 Latar Belakang'),
					paragraph('Isi.'),
					heading(1, 'BAB II TINJAUAN PUSTAKA'),
					paragraph(''),
				),
			],
			brief([chapter('BAB I Pendahuluan'), chapter('BAB II Tinjauan Pustaka'), chapter('BAB III Metode')]),
			null,
		)
		expect(progress?.sections.map((section) => section.state)).toEqual(['written', 'empty', 'missing'])
	})

	test('bab di tab lain tetap terhitung (CV dan surat lamaran)', () => {
		const progress = outlineProgress(
			[
				doc(heading(1, 'Curriculum Vitae'), paragraph('Andi.')),
				doc(heading(1, 'Surat Lamaran'), paragraph('Dengan hormat.')),
			],
			brief([chapter('Curriculum Vitae'), chapter('Surat Lamaran')]),
			null,
		)
		expect(progress && outlineDone(progress)).toBe(true)
	})

	test('tanpa daftar bab tidak ada kerangka yang diperiksa', () => {
		expect(outlineProgress([doc(paragraph('x'))], EMPTY_BRIEF, 3)).toBeNull()
	})
})

describe('tabel dan gambar yang dijanjikan', () => {
	const states = (...content: JSONContent[]) =>
		outlineProgress(
			[doc(heading(1, 'Hasil'), ...content)],
			brief([chapter('Hasil', ['Tabel 1: data penjualan', 'Gambar 1: grafik batang'])]),
			null,
		)?.items.map((item) => [item.label, item.state])

	test('keterangan dengan tabel di bawahnya dan gambar di atasnya: ada', () => {
		expect(
			states(paragraph('Tabel 1. Data penjualan'), table, diagram, paragraph('Gambar 1. Grafik batang')),
		).toEqual([
			['Tabel 1', 'present'],
			['Gambar 1', 'present'],
		])
	})

	test('keterangan tanpa tabel/gambar di dekatnya: baru keterangannya', () => {
		expect(states(paragraph('Tabel 1. Data penjualan'), paragraph('Gambar 1. Grafik batang'))).toEqual([
			['Tabel 1', 'caption-only'],
			['Gambar 1', 'caption-only'],
		])
	})

	test('label yang hanya disebut di kalimat, atau "Tabel 10", bukan keterangan', () => {
		expect(
			states(
				paragraph('Seperti pada Tabel 1 dan Gambar 1, penjualan naik.'),
				paragraph('Tabel 10. Lain'),
				table,
			),
		).toEqual([
			['Tabel 1', 'missing'],
			['Gambar 1', 'missing'],
		])
	})

	test('janji tanpa label bernomor tidak ditagih', () => {
		const progress = outlineProgress(
			[doc(heading(1, 'Hasil'), paragraph('isi'))],
			brief([chapter('Hasil', ['ringkasan temuan'])]),
			null,
		)
		expect(progress?.items).toEqual([])
	})
})

describe('panjang terhadap target (AC-7)', () => {
	const at = (pages: number) =>
		outlineProgress([doc(heading(1, 'A'), paragraph('isi'))], brief([chapter('A')], [8, 12]), pages)

	test('di dalam rentang: selesai; di luar: belum', () => {
		expect(outlineDone(at(10) as never)).toBe(true)
		expect(outlineDone(at(18) as never)).toBe(false)
		expect(outlineDone(at(6) as never)).toBe(false)
	})

	test('panjang tak terukur (beberapa tab) tidak dinilai', () => {
		const progress = outlineProgress(
			[doc(heading(1, 'A'), paragraph('isi'))],
			brief([chapter('A')], [8, 12]),
			null,
		)
		expect(progress?.pages).toBeNull()
		expect(progress && outlineDone(progress)).toBe(true)
	})

	test('terlalu panjang: model diminta memadatkan, bukan menambah', () => {
		expect(outlineForModel(at(18) as never)).toContain(
			'Length: 18 pages, the writer asked for 8-12 - shorten existing sections, do not add.',
		)
	})
})

describe('laporan untuk model dan penulis', () => {
	const progress = outlineProgress(
		[doc(heading(1, 'Pendahuluan'), paragraph('isi'), paragraph('Tabel 1. Data'), heading(1, 'Metode'))],
		brief(
			[
				chapter('Pendahuluan', ['Tabel 1: data', 'Gambar 2: infografis']),
				chapter('Metode'),
				chapter('Simpulan'),
			],
			[8, 12],
		),
		18,
	)

	test('model mendapat apa yang kurang, dengan sebabnya', () => {
		expect(progress && outlineForModel(progress)).toBe(
			[
				'1 of 3 outline sections have body text.',
				'Still empty: "Metode".',
				'No heading in the document yet for: "Simpulan".',
				'Promised but not in the document: Gambar 2 (no caption starting with that label).',
				'Captioned but with no real table or figure next to the caption: Tabel 1.',
				'Length: 18 pages, the writer asked for 8-12 - shorten existing sections, do not add.',
			].join(' '),
		)
	})

	test('penulis mendapat satu baris pendek dan rinciannya', () => {
		const writer = progress && outlineForWriter(progress)
		expect(writer?.short).toBe('2 bagian kosong · Tabel 1, Gambar 2 belum ada · 18 dari 8-12 hlm')
		expect(writer?.detail).toEqual([
			'Belum berisi: Metode, Simpulan',
			'Tabel 1: baru keterangannya',
			'Gambar 2: belum ada',
			'Panjang 18 halaman, target 8-12',
		])
	})

	test('kerangka terpenuhi dinyatakan', () => {
		const done = outlineProgress([doc(heading(1, 'A'), paragraph('isi'))], brief([chapter('A')]), null)
		expect(done && outlineForModel(done)).toBe(
			'1 of 1 outline sections have body text. Everything in the outline is in place.',
		)
	})
})
