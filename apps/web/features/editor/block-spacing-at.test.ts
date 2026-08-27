import { describe, expect, test } from 'bun:test'
import { getSchema } from '@tiptap/core'
import { EditorState, TextSelection } from '@tiptap/pm/state'
import type { Editor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { BlockSpacing } from './block-spacing'
import { blockSpacingAt } from './block-spacing-at'

const schema = getSchema([StarterKit, BlockSpacing])

function editorInParagraph(attrs: Record<string, unknown> = {}): Editor {
	const doc = schema.node('doc', null, [schema.node('paragraph', attrs, [schema.text('halo')])])
	const state = EditorState.create({ schema, doc })
	return { state: state.apply(state.tr.setSelection(TextSelection.create(state.doc, 2))) } as unknown as Editor
}

describe('blockSpacingAt', () => {
	test('membaca ketiga nilai dari blok tempat kursor berada', () => {
		expect(blockSpacingAt(editorInParagraph({ lineHeight: '1.5', spaceBefore: 16, spaceAfter: 8 }))).toEqual(
			{ lineHeight: '1.5', spaceBefore: 16, spaceAfter: 8 },
		)
	})

	test('atribut yang belum diatur: lineHeight null, spasi 0', () => {
		expect(blockSpacingAt(editorInParagraph())).toEqual({
			lineHeight: null,
			spaceBefore: 0,
			spaceAfter: 0,
		})
	})
})
