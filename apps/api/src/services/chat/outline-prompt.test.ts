import { describe, expect, test } from 'bun:test'
import { EMPTY_BRIEF, type ResearchBrief } from '@writer-hub/shared'
import { chatBodySchema } from './dto'
import { contextMessage } from './messages'
import { buildSystemPrompt, researchBriefPrompt } from './prompts'

describe('konteks editor sampai ke model', () => {
	test('page dan outline tidak lagi dibuang skema', () => {
		const parsed = chatBodySchema.parse({
			messages: [{ role: 'user', content: 'lanjut' }],
			context: { page: 'A4 portrait', outline: '2 of 5 outline sections have body text.' },
		})
		expect(parsed.context).toEqual({
			page: 'A4 portrait',
			outline: '2 of 5 outline sections have body text.',
		})
		expect(contextMessage(parsed.context)?.content).toBe(
			'[Editor context]\nPage: A4 portrait\n\nOutline check: 2 of 5 outline sections have body text.',
		)
	})
})

describe('kerangka di prompt', () => {
	const outline: ResearchBrief = {
		...EMPTY_BRIEF,
		chapters: [
			{
				title: 'Pendahuluan',
				summary: 'Latar dan tujuan.',
				status: 'belum',
				source: 'ai',
				items: ['Tabel 1: statistik adopsi', 'Gambar 1: tren'],
				at: 1,
			},
		],
		plan: {
			pages: [8, 12],
			notes: ['Transaksi uang elektronik Rp835 T pada 2023 (Bank Indonesia, 2024)'],
			at: 1,
		},
	}

	test('janji tabel/gambar ikut di baris babnya, dan judulnya harus dipertahankan', () => {
		const prompt = researchBriefPrompt(outline)
		expect(prompt).toContain(
			'- Pendahuluan [belum]: Latar dan tujuan. | promises: Tabel 1: statistik adopsi; Gambar 1: tren',
		)
		expect(prompt).toContain('Keep these')
		expect(prompt).not.toContain('no research brief yet')
	})

	test('panjang yang direncanakan dan catatan riset, supaya riset tidak diulang', () => {
		const prompt = researchBriefPrompt(outline)
		expect(prompt).toContain('Planned length: 8-12 pages.')
		expect(prompt).toContain('instead of searching again')
		expect(prompt).toContain('- Transaksi uang elektronik Rp835 T pada 2023 (Bank Indonesia, 2024)')
	})

	test('panduan alat menyuruh mencatat kerangka setiap kali mengusulkan outline', () => {
		expect(buildSystemPrompt({ withTools: true, research: false, memory: null })).toContain(
			'record it in the same turn with set_outline',
		)
	})
})
