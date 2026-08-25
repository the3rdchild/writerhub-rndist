'use client'

import type { Editor } from '@tiptap/react'
import { buildTextIndex, textRangeToPM } from '@/features/document/tiptap-offsets'
import { resolveSpan } from '@/features/document/suggestions'
import { toEditorContent } from './markdown'
export function replaceTextRange(
	editor: Editor,
	{ offset, expected }: { offset: number; length: number; expected: string },
	replacement: string,
	{ focus = false }: { focus?: boolean } = {},
): boolean {
	const index = buildTextIndex(editor.state.doc)

	const span = resolveSpan(index.text, expected, offset)
	if (!span) return false

	const range = textRangeToPM(index, span.offset, span.length)
	if (!range) return false
	const chain = editor.chain().insertContentAt(range, toEditorContent(replacement))
	if (focus) chain.focus()
	chain.run()
	return true
}
