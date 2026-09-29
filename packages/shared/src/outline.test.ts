import { describe, expect, test } from 'bun:test'
import {
	applyOutline,
	type BriefChapter,
	EMPTY_BRIEF,
	normalizeBrief,
	type ResearchBrief,
	readPageRange,
} from './brief'

const at = 1
const chapter = (title: string, extra: Partial<BriefChapter> = {}): BriefChapter => ({
	title,
	summary: '',
	status: 'belum',
	source: 'ai',
	at,
	...extra,
})

describe('kerangka dari set_outline', () => {
	test('bab kerangka menjadi daftar bab berurutan, dengan janji tabel/gambarnya', () => {
		const { brief, report } = applyOutline(
			EMPTY_BRIEF,
			{
				sections: [
					{ title: 'Pendahuluan', items: ['Tabel 1: statistik adopsi', ' ', 'Gambar 1: tren'] },
					{ title: 'Metode', summary: 'Survei 200 mahasiswa.' },
				],
				pages: [8, 12],
				notes: ['Transaksi uang elektronik Rp835 T (BI, 2024)'],
			},
			5,
		)
		expect(brief.chapters.map((item) => [item.title, item.status, item.items ?? []])).toEqual([
			['Pendahuluan', 'belum', ['Tabel 1: statistik adopsi', 'Gambar 1: tren']],
			['Metode', 'belum', []],
		])
		expect(brief.chapters[1].summary).toBe('Survei 200 mahasiswa.')
		expect(brief.plan).toEqual({
			pages: [8, 12],
			notes: ['Transaksi uang elektronik Rp835 T (BI, 2024)'],
			at: 5,
		})
		expect(report).toEqual({ sections: 2, items: 2, kept: [], replaced: [] })
	})

	test('bab rekaan AI dan semaian template yang tidak disebut diganti; bab penulis dipertahankan di belakang', () => {
		const current: ResearchBrief = {
			...EMPTY_BRIEF,
			chapters: [
				chapter('BAB I', { source: 'template' }),
				chapter('Lampiran Wawancara', { source: 'user', summary: 'Transkrip.' }),
				chapter('Catatan AI', { source: 'ai' }),
			],
		}
		const { brief, report } = applyOutline(current, { sections: [{ title: 'Pendahuluan' }] }, 5)
		expect(brief.chapters.map((item) => item.title)).toEqual(['Pendahuluan', 'Lampiran Wawancara'])
		expect(report.kept).toEqual(['Lampiran Wawancara'])
		expect(report.replaced).toEqual(['BAB I', 'Catatan AI'])
	})

	test('bab yang sama: status berjalan dan ringkasan penulis tidak ditimpa', () => {
		const current: ResearchBrief = {
			...EMPTY_BRIEF,
			chapters: [chapter('BAB I Pendahuluan', { status: 'draf', source: 'user', summary: 'Tulisan saya.' })],
		}
		const { brief } = applyOutline(
			current,
			{ sections: [{ title: 'bab i  PENDAHULUAN', summary: 'Ringkasan AI.', items: ['Tabel 1.1: data'] }] },
			5,
		)
		expect(brief.chapters).toHaveLength(1)
		expect(brief.chapters[0]).toMatchObject({
			title: 'BAB I Pendahuluan',
			status: 'draf',
			source: 'user',
			summary: 'Tulisan saya.',
			items: ['Tabel 1.1: data'],
		})
	})

	test('tanpa pages dan notes, target dan catatan lama dipertahankan; pages null menghapus target', () => {
		const current: ResearchBrief = { ...EMPTY_BRIEF, plan: { pages: [5, 8], notes: ['lama'], at } }
		expect(applyOutline(current, { sections: [{ title: 'A' }] }, 5).brief.plan).toEqual({
			pages: [5, 8],
			notes: ['lama'],
			at: 5,
		})
		expect(
			applyOutline(current, { sections: [{ title: 'A' }], pages: null, notes: [] }, 5).brief.plan,
		).toBeUndefined()
	})

	test('judul kembar dan judul kosong dibuang', () => {
		const { brief } = applyOutline(
			EMPTY_BRIEF,
			{ sections: [{ title: 'A' }, { title: ' a ' }, { title: '' }] },
			5,
		)
		expect(brief.chapters.map((item) => item.title)).toEqual(['A'])
	})

	test('usulan untuk bab yang tidak lagi ada ikut gugur', () => {
		const current: ResearchBrief = {
			...EMPTY_BRIEF,
			chapters: [chapter('Lama', { source: 'ai' })],
			proposals: [{ id: 'chapter:lama', chapter: 'Lama', value: 'x', at }],
		}
		expect(applyOutline(current, { sections: [{ title: 'Baru' }] }, 5).brief.proposals).toEqual([])
	})
})

describe('rentang halaman dan pembacaan brief', () => {
	test('rentang yang masuk akal saja', () => {
		expect(readPageRange([8, 12])).toEqual([8, 12])
		expect(readPageRange(['8', '12.4'])).toEqual([8, 12])
		expect(readPageRange([12, 8])).toBeUndefined()
		expect(readPageRange([0, 3])).toBeUndefined()
		expect(readPageRange([1])).toBeUndefined()
	})

	test('normalizeBrief membaca janji dan kerangka, membuang yang bukan teks', () => {
		const brief = normalizeBrief({
			entries: {},
			chapters: [{ title: 'A', summary: '', status: 'belum', items: ['Tabel 1', 3, ''] }],
			proposals: [],
			plan: { pages: [3, 5], notes: ['catatan', null], at: 2 },
		})
		expect(brief.chapters[0].items).toEqual(['Tabel 1'])
		expect(brief.plan).toEqual({ pages: [3, 5], notes: ['catatan'], at: 2 })
		expect(
			normalizeBrief({ entries: {}, chapters: [], proposals: [], plan: { pages: 'x' } }).plan,
		).toBeUndefined()
	})
})
