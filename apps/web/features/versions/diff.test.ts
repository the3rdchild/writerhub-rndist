import { describe, expect, test } from 'bun:test'
import type { JSONContent } from '@tiptap/core'
import { computeVersionDiff, diffVersionDocuments, versionPlainText } from './diff'

function paragraphs(...texts: string[]): JSONContent {
	return {
		type: 'doc',
		content: texts.map((text) => ({
			type: 'paragraph',
			content: [{ type: 'text', text }],
		})),
	}
}

describe('versionPlainText', () => {
	test('blok teks digabung dengan \\n, mengikuti urutan dokumen', () => {
		expect(versionPlainText(paragraphs('satu', 'dua tiga'))).toBe('satu\ndua tiga')
	})
})

describe('computeVersionDiff', () => {
	test('dokumen identik menghasilkan nol rentang', () => {
		expect(computeVersionDiff('satu dua\ntiga', 'satu dua\ntiga')).toEqual([])
	})

	test('kata yang ditambahkan di draf menjadi titik sisip', () => {
		const ranges = computeVersionDiff('kucing makan', 'kucing makan ikan')
		expect(ranges).toEqual([{ offset: 12, length: 0, kind: 'added', words: ' ikan' }])
	})

	test('kata yang hilang dari draf menjadi rentang removed', () => {
		const ranges = computeVersionDiff('kucing makan ikan', 'kucing makan')
		expect(ranges).toEqual([{ offset: 12, length: 5, kind: 'removed' }])
	})

	test('pengubahan kata menghasilkan rentang removed dan titik added', () => {
		const versionText = 'kucing makan ikan'
		const ranges = computeVersionDiff(versionText, 'kucing makan nasi')

		expect(ranges).toHaveLength(2)
		const removed = ranges.find((range) => range.kind === 'removed')
		const added = ranges.find((range) => range.kind === 'added')
		expect(removed).toBeDefined()
		expect(versionText.slice(removed!.offset, removed!.offset + removed!.length)).toBe('ikan')
		expect(added?.words).toContain('nasi')
		expect(added?.length).toBe(0)
	})

	test('rentang removed yang melintasi batas blok dipotong per blok', () => {
		const versionText = 'satu\ndua\ntiga'
		const ranges = computeVersionDiff(versionText, 'tiga')

		// "satu\ndua\n" dihapus sekaligus, tapi harus jadi dua rentang tanpa `\n`.
		expect(ranges).toEqual([
			{ offset: 0, length: 4, kind: 'removed' },
			{ offset: 5, length: 3, kind: 'removed' },
		])
		for (const range of ranges) {
			expect(versionText.slice(range.offset, range.offset + range.length)).not.toContain('\n')
		}
	})

	test('perubahan di paragraf kedua berkoordinat teks versi', () => {
		const versionText = 'satu dua\ntiga empat'
		const ranges = computeVersionDiff(versionText, 'satu dua\ntiga lima')

		const removed = ranges.find((range) => range.kind === 'removed')
		expect(versionText.slice(removed!.offset, removed!.offset + removed!.length)).toBe('empat')
	})

	test('versi kosong: seluruh draf adalah sisipan', () => {
		expect(computeVersionDiff('', 'halo dunia')).toEqual([
			{ offset: 0, length: 0, kind: 'added', words: 'halo dunia' },
		])
	})

	test('draf kosong: seluruh versi adalah rentang removed', () => {
		expect(computeVersionDiff('halo dunia', '')).toEqual([
			{ offset: 0, length: 10, kind: 'removed' },
		])
	})

	test('sisipan yang hanya berisi spasi atau baris baru diabaikan', () => {
		const ranges = computeVersionDiff('satu dua', 'satu\ndua')
		expect(ranges.filter((range) => range.kind === 'added')).toEqual([])
	})
})

describe('diffVersionDocuments', () => {
	test('dua naskah JSON identik menghasilkan nol rentang', () => {
		const json = paragraphs('naskah yang sama', 'dua paragraf')
		expect(diffVersionDocuments(json, json)).toEqual([])
	})

	test('selisih antar naskah JSON terbaca dalam koordinat teks versi', () => {
		const version = paragraphs('paragraf pertama', 'kata lama')
		const draft = paragraphs('paragraf pertama', 'kata baru')

		const ranges = diffVersionDocuments(version, draft)
		const removed = ranges.find((range) => range.kind === 'removed')
		expect('paragraf pertama\nkata lama'.slice(removed!.offset, removed!.offset + removed!.length)).toBe('lama')
	})
})
