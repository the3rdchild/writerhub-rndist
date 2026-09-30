import { describe, expect, test } from 'bun:test'
import { previewContent } from './dto'

const paragraph = (chars: number) => ({
	type: 'paragraph',
	content: [{ type: 'text', text: 'a'.repeat(chars) }],
})

describe('previewContent', () => {
	test('sampul akademik yang terdiri dari puluhan baris pendek tidak terpotong', () => {
		const content = { type: 'doc', content: Array.from({ length: 70 }, () => paragraph(20)) }
		expect((previewContent(content).content as unknown[]).length).toBe(70)
	})

	test('kerangka pendek dikirim utuh', () => {
		const content = { type: 'doc', content: [paragraph(100), paragraph(200)] }
		expect(previewContent(content)).toEqual(content)
	})

	test('berhenti sesudah anggaran teks terlampaui', () => {
		const content = { type: 'doc', content: Array.from({ length: 10 }, () => paragraph(1_000)) }
		const preview = previewContent(content)
		// Blok yang melewati anggaran tetap ikut supaya halaman pratinjau penuh.
		expect((preview.content as unknown[]).length).toBe(4)
		expect(preview.type).toBe('doc')
	})

	test('teks di dalam simpul bersarang ikut dihitung', () => {
		const table = {
			type: 'table',
			content: [{ type: 'tableRow', content: [{ type: 'tableCell', content: [paragraph(4_000)] }] }],
		}
		const content = { type: 'doc', content: [table, paragraph(10), paragraph(10)] }
		expect((previewContent(content).content as unknown[]).length).toBe(1)
	})

	test('batas jumlah blok berlaku untuk kerangka yang teksnya sedikit', () => {
		const content = { type: 'doc', content: Array.from({ length: 200 }, () => ({ type: 'horizontalRule' })) }
		expect((previewContent(content).content as unknown[]).length).toBe(120)
	})
})
