import { describe, expect, test } from 'bun:test'
import type { JSONContent } from '@tiptap/core'
import { textFingerprint } from '@writer-hub/shared'
import {
	chapterFingerprints,
	chapterTextLengths,
	headingSections,
	topLevelHeadings,
	withWrittenChapters,
} from './chapters'

const heading = (level: number, text: string): JSONContent => ({
	type: 'heading',
	attrs: { level },
	content: [{ type: 'text', text }],
})
const paragraph = (text: string): JSONContent => ({ type: 'paragraph', content: [{ type: 'text', text }] })

const tab: JSONContent = {
	type: 'doc',
	content: [
		heading(1, 'BAB I Pendahuluan'),
		paragraph('Latar belakang.'),
		heading(2, 'Rumusan Masalah'),
		paragraph('Apakah...'),
		heading(1, 'BAB II Tinjauan Pustaka'),
	],
}

describe('bab dari naskah', () => {
	test('satu bab memuat subbabnya sampai judul setingkat berikutnya', () => {
		const [first, sub, second] = headingSections(tab)
		expect(first).toEqual({
			title: 'BAB I Pendahuluan',
			level: 1,
			text: 'Latar belakang.\nRumusan Masalah\nApakah...',
		})
		expect(sub.text).toBe('Apakah...')
		expect(second.text).toBe('')
	})

	test('sidik jari dicari lewat judul tanpa peduli huruf besar dan spasi', () => {
		const prints = chapterFingerprints([tab])
		expect(prints.get('bab i pendahuluan')).toBe(
			textFingerprint('Latar belakang.\nRumusan Masalah\nApakah...'),
		)
	})

	test('bab di tab lain ikut terbaca; judul kembar memakai yang pertama', () => {
		const other: JSONContent = { type: 'doc', content: [heading(1, 'BAB I PENDAHULUAN'), paragraph('lain')] }
		const prints = chapterFingerprints([tab, other])
		expect(prints.get('bab i pendahuluan')).not.toBe(textFingerprint('lain'))
	})

	test('judul tingkat teratas menjadi calon daftar bab', () => {
		expect(topLevelHeadings([tab])).toEqual([
			{ title: 'BAB I Pendahuluan', empty: false },
			{ title: 'BAB II Tinjauan Pustaka', empty: true },
		])
		expect(topLevelHeadings([{ type: 'doc', content: [] }])).toEqual([])
	})
})

describe('status bab yang dikirim ke AI', () => {
	test('bab yang di naskah sudah berisi tidak lagi dikirim sebagai "belum"', () => {
		const brief = {
			entries: {},
			proposals: [],
			chapters: [
				{ title: 'BAB I Pendahuluan', summary: '', status: 'belum' as const, source: 'ai' as const, at: 1 },
				{
					title: 'BAB II Tinjauan Pustaka',
					summary: '',
					status: 'belum' as const,
					source: 'ai' as const,
					at: 1,
				},
			],
		}
		const result = withWrittenChapters(brief, chapterTextLengths([tab]))
		expect(result.chapters.map((chapter) => chapter.status)).toEqual(['draf', 'belum'])
		// Tanpa perubahan, objek yang sama dikembalikan.
		expect(withWrittenChapters(result, new Map())).toBe(result)
	})
})
