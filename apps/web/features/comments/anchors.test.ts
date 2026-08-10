import { describe, expect, test } from 'bun:test'
import { getSchema } from '@tiptap/core'
import { buildEditorExtensions } from '@/features/editor/extensions'
import { commentRangesInDoc } from './anchors'
import { COMMENT_MARK } from './comment-mark'

const schema = getSchema(buildEditorExtensions({}))

function comment(id: string) {
	return schema.marks[COMMENT_MARK].create({ commentId: id })
}

describe('rentang komentar', () => {
	test('utas yang terpecah beberapa text node dibaca sebagai satu rentang', () => {
		// "Satu " + tebal "kalimat" + " utuh", ketiganya ditandai komentar yang sama.
		const doc = schema.node('doc', null, [
			schema.node('paragraph', null, [
				schema.text('Satu ', [comment('c-1')]),
				schema.text('kalimat', [comment('c-1'), schema.marks.bold.create()]),
				schema.text(' utuh', [comment('c-1')]),
			]),
		])

		const ranges = commentRangesInDoc(doc)
		expect(ranges.size).toBe(1)

		const range = ranges.get('c-1')
		expect(range).toBeDefined()
		// Tepat sepanjang teksnya, bukan sepotong yang pertama saja.
		expect(doc.textBetween(range?.from ?? 0, range?.to ?? 0)).toBe('Satu kalimat utuh')
	})

	test('dua komentar pada paragraf yang sama tidak tertukar', () => {
		const doc = schema.node('doc', null, [
			schema.node('paragraph', null, [
				schema.text('awal ', [comment('c-1')]),
				schema.text('tengah '),
				schema.text('akhir', [comment('c-2')]),
			]),
		])

		const ranges = commentRangesInDoc(doc)
		expect(ranges.size).toBe(2)
		expect(doc.textBetween(ranges.get('c-1')?.from ?? 0, ranges.get('c-1')?.to ?? 0)).toBe('awal ')
		expect(doc.textBetween(ranges.get('c-2')?.from ?? 0, ranges.get('c-2')?.to ?? 0)).toBe('akhir')
	})

	test('naskah tanpa mark komentar tidak menghasilkan rentang', () => {
		const doc = schema.node('doc', null, [
			schema.node('paragraph', null, [schema.text('tanpa komentar')]),
		])

		expect(commentRangesInDoc(doc).size).toBe(0)
	})
})
