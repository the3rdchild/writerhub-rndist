'use client'

import type { Editor } from '@tiptap/react'
import { useEffect, useMemo, useState } from 'react'
import { buildTextIndex, pmRangeToText } from '@/features/document/tiptap-offsets'
import { useEditorInstance } from '@/features/editor/editor-context'

export interface EditorSelection {
	from: number
	to: number
	text: string
	words: number
}

const MIN_SELECTION_LENGTH = 2

function countWords(text: string): number {
	const trimmed = text.trim()
	return trimmed ? trimmed.split(/\s+/).length : 0
}

function read(editor: Editor): EditorSelection | null {
	const { from, to, empty } = editor.state.selection
	if (empty) return null

	const text = editor.state.doc.textBetween(from, to, '\n', ' ')
	if (text.trim().length < MIN_SELECTION_LENGTH) return null

	return { from, to, text, words: countWords(text) }
}

function same(a: EditorSelection | null, b: EditorSelection | null): boolean {
	if (a === null || b === null) return a === b
	return a.from === b.from && a.to === b.to && a.text === b.text
}

export function useEditorSelection(editor: Editor | null): EditorSelection | null {
	const [selection, setSelection] = useState<EditorSelection | null>(null)

	useEffect(() => {
		if (!editor) {
			setSelection(null)
			return
		}

		const sync = () =>
			setSelection((current) => {
				const next = read(editor)
				return same(current, next) ? current : next
			})

		sync()
		editor.on('selectionUpdate', sync)
		editor.on('transaction', sync)
		return () => {
			editor.off('selectionUpdate', sync)
			editor.off('transaction', sync)
		}
	}, [editor])

	return selection
}

export function selectionTextRange(
	editor: Editor,
	selection: EditorSelection,
): { offset: number; length: number } | null {
	return pmRangeToText(buildTextIndex(editor.state.doc), selection.from, selection.to)
}

export interface SelectionScope {
	text: string
	offset: number
	length: number
	scoped: true
	wordCount: number
	surrounding: string
}

export function useSelectionScope(): SelectionScope | null {
	const { editor } = useEditorInstance()
	const selection = useEditorSelection(editor)

	return useMemo(() => {
		if (!editor || !selection) return null
		const range = selectionTextRange(editor, selection)
		if (!range) return null
		return {
			text: selection.text,
			offset: range.offset,
			length: range.length,
			scoped: true,
			wordCount: selection.words,
			surrounding: surroundingText(editor, selection),
		}
	}, [editor, selection])
}

export function surroundingText(editor: Editor, selection: EditorSelection, radius = 1_200): string {
	const { doc } = editor.state
	const from = Math.max(0, selection.from - radius)
	const to = Math.min(doc.content.size, selection.to + radius)
	return doc.textBetween(from, to, '\n', ' ')
}
