import { describe, expect, test } from 'bun:test'
import { buildSchema } from '@/features/sync/serialize'
import { buildTextIndex, textRangeToPM } from './tiptap-offsets'

const schema = buildSchema()

describe('rentang teks di sekitar pindah baris lunak', () => {
	const doc = schema.nodeFromJSON({
		type: 'doc',
		content: [
			{
				type: 'paragraph',
				content: [{ type: 'text', text: 'Judul' }, { type: 'hardBreak' }, { type: 'text', text: 'Isi' }],
			},
		],
	})
	const index = buildTextIndex(doc)

	test('rentang yang dimulai sesudah pindah baris tidak menelan pindah barisnya', () => {
		const range = textRangeToPM(index, index.text.indexOf('Isi'), 3)
		expect(range && doc.textBetween(range.from, range.to, '', '⏎')).toBe('Isi')
	})

	test('rentang yang berakhir sebelum pindah baris juga berhenti di sana', () => {
		const range = textRangeToPM(index, 0, 5)
		expect(range && doc.textBetween(range.from, range.to, '', '⏎')).toBe('Judul')
	})
})
