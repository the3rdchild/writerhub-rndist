import { describe, expect, test } from 'bun:test'
import { markdownToDoc } from '@/services/drafts/markdown-doc'
import { columnBreak, withColumnsAfterTitle, withColumnsBefore } from './section-columns'

const TWO_COLUMNS = { count: 2, gap: 19 }

describe('columnBreak', () => {
	test('berbentuk persis seperti yang ditulis perintah setSectionColumns editor', () => {
		expect(columnBreak(TWO_COLUMNS)).toEqual({
			type: 'sectionBreak',
			attrs: { pageSetup: null, columns: TWO_COLUMNS, continuous: true },
		})
	})
})

describe('withColumnsBefore', () => {
	test('pembatas disisipkan tepat sebelum heading bernama', () => {
		const doc = markdownToDoc('# Judul\n\nAbstrak satu paragraf.\n\n# I. Introduction\n\nIsi.')

		const result = withColumnsBefore(doc, 'I. Introduction', TWO_COLUMNS)

		expect(result?.content.map((node) => node.type)).toEqual([
			'heading',
			'paragraph',
			'sectionBreak',
			'heading',
			'paragraph',
		])
	})

	test('mengembalikan null bila headingnya tidak ada, bukan dokumen tanpa kolom', () => {
		const doc = markdownToDoc('# Judul\n\nIsi.')
		expect(withColumnsBefore(doc, 'Tidak Ada', TWO_COLUMNS)).toBeNull()
	})
})

describe('withColumnsAfterTitle', () => {
	test('naskah berjudul heading: judul tetap selebar halaman, sisanya berkolom', () => {
		const doc = markdownToDoc('# Paper Title\n\nAbstrak.\n\n# I. INTRODUCTION\n\nIsi.')

		const result = withColumnsAfterTitle(doc, TWO_COLUMNS)

		expect(result.content[0].type).toBe('heading')
		expect(result.content[1]).toEqual(columnBreak(TWO_COLUMNS))
	})

	test('naskah tanpa heading pembuka mendapat pembatasnya di awal dokumen', () => {
		const doc = markdownToDoc('Langsung isi tanpa judul.')

		const result = withColumnsAfterTitle(doc, TWO_COLUMNS)

		expect(result.content[0]).toEqual(columnBreak(TWO_COLUMNS))
	})
})
