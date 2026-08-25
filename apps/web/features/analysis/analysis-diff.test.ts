import { describe, expect, it } from 'vitest'
import type { EditorSuggestion } from '@/features/document/suggestions'
import {
	computeAnalysisDiff,
	editsFromChanges,
	editsFromSentences,
	editsFromSuggestions,
	synthesizeResultText,
} from './analysis-diff'

describe('synthesizeResultText', () => {
	it('menerapkan satu suntingan pada posisi yang tepat', () => {
		const result = synthesizeResultText('kucing makan ikan', [
			{ offset: 7, length: 5, replacement: 'memakan' },
		])
		expect(result).toBe('kucing memakan ikan')
	})

	it('menerapkan beberapa suntingan dari offset terbesar tanpa menggeser yang belum diproses', () => {
		const result = synthesizeResultText('satu dua tiga', [
			{ offset: 0, length: 4, replacement: 'ONE' },
			{ offset: 9, length: 4, replacement: 'THREE' },
		])
		expect(result).toBe('ONE dua THREE')
	})

	it('tidak mengubah teks bila tidak ada suntingan', () => {
		expect(synthesizeResultText('apa adanya', [])).toBe('apa adanya')
	})
})

describe('editsFromSuggestions', () => {
	it('membuang saran yang sudah di-dismiss', () => {
		const suggestions: EditorSuggestion[] = [
			{ id: 'a', original: 'salah', replacement: 'benar', offset: 0, length: 5, category: 'grammar' },
			{ id: 'b', original: 'lagi', replacement: 'ok', offset: 10, length: 4, category: 'grammar', dismissed: true },
		] as unknown as EditorSuggestion[]

		const edits = editsFromSuggestions(suggestions)
		expect(edits).toEqual([{ offset: 0, length: 5, replacement: 'benar' }])
	})

	it('jatuh ke panjang original bila length tidak ada', () => {
		const suggestions = [
			{ id: 'a', original: 'salah', replacement: 'benar', offset: 0, category: 'grammar' },
		] as unknown as EditorSuggestion[]
		expect(editsFromSuggestions(suggestions)).toEqual([
			{ offset: 0, length: 5, replacement: 'benar' },
		])
	})
})

describe('editsFromChanges', () => {
	it('membuang change yang sudah masuk riwayat Applied', () => {
		const pending = [
			{ offset: 0, length: 3, original: 'abc', replacement: 'ABC' },
			{ offset: 5, length: 3, original: 'def', replacement: 'DEF' },
		]
		const applied = [{ offset: 0, original: 'abc', applied: 'ABC' }]

		expect(editsFromChanges(pending, applied)).toEqual([
			{ offset: 5, length: 3, replacement: 'DEF' },
		])
	})
})

describe('editsFromSentences', () => {
	it('hanya mengambil kalimat yang masih punya saran dan belum diproses', () => {
		const sentences = [
			{ offset: 0, length: 5, text: 'aaaaa', score: 90, suggestion: 'bbbbb' },
			{ offset: 6, length: 5, text: 'ccccc', score: 90, suggestion: null },
			{ offset: 12, length: 5, text: 'ddddd', score: 90, suggestion: 'eeeee', applied: true },
			{ offset: 18, length: 5, text: 'fffff', score: 90, suggestion: 'ggggg', dismissed: true },
		]

		expect(editsFromSentences(sentences)).toEqual([
			{ offset: 0, length: 5, replacement: 'bbbbb' },
		])
	})
})

describe('computeAnalysisDiff', () => {
	it('mengembalikan rentang removed untuk teks yang diganti', () => {
		const ranges = computeAnalysisDiff('kucing makan', 'kucing memakan')
		expect(ranges.some((r) => r.kind === 'removed')).toBe(true)
	})

	it('mengembalikan daftar kosong bila teks identik', () => {
		expect(computeAnalysisDiff('sama persis', 'sama persis')).toEqual([])
	})
})
