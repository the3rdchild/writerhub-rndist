'use client'

import type { TextChange } from '@writer-hub/shared'
import { useCallback, useEffect, useState } from 'react'
import { resolveSpan } from '@/features/document/suggestions'
import { buildTextIndex } from '@/features/document/tiptap-offsets'
import { replaceTextRange } from '@/features/editor/apply-text'
import { useEditorInstance } from '@/features/editor/editor-context'
export interface AppliedChange {
	id: number
	original: string
	applied: string
	offset: number
}
export function usePendingChanges(changes: readonly TextChange[] | undefined) {
	const { editor } = useEditorInstance()
	const [pending, setPending] = useState<TextChange[]>([])
	const [applied, setApplied] = useState<AppliedChange[]>([])
	const [nextId, setNextId] = useState(0)

	useEffect(() => {
		setPending(changes ? [...changes] : [])
		setApplied([])
	}, [changes])
	const accept = useCallback(
		(index: number, candidate?: string) => {
			const change = pending[index]
			if (!change) return

			const replacement = candidate ?? change.replacement

			if (editor) {
				const ok = replaceTextRange(
					editor,
					{ offset: change.offset, length: change.length, expected: change.original },
					replacement,
				)
				if (ok) {
					setApplied((current) => [
						...current,
						{ id: nextId, original: change.original, applied: replacement, offset: change.offset },
					])
					setNextId((id) => id + 1)
				}
			}

			const delta = replacement.length - change.length
			setPending((current) =>
				current
					.filter((_, i) => i !== index)
					.map((other) =>
						other.offset > change.offset ? { ...other, offset: other.offset + delta } : other,
					),
			)
		},
		[pending, editor, nextId],
	)

	const dismiss = useCallback((index: number) => {
		setPending((current) => current.filter((_, i) => i !== index))
	}, [])

	const acceptAll = useCallback(() => {
		if (editor) {
			const ordered = [...pending].sort((a, b) => b.offset - a.offset)
			for (const change of ordered) {
				replaceTextRange(
					editor,
					{ offset: change.offset, length: change.length, expected: change.original },
					change.replacement,
				)
			}
		}
		setPending([])
		setApplied([])
	}, [pending, editor])
	const revert = useCallback(
		(id: number) => {
			const entry = applied.find((item) => item.id === id)
			if (!entry || !editor) return

			const ok = replaceTextRange(
				editor,
				{ offset: entry.offset, length: entry.applied.length, expected: entry.applied },
				entry.original,
			)
			if (ok) setApplied((current) => current.filter((item) => item.id !== id))
		},
		[applied, editor],
	)
	const canRevert = useCallback(
		(id: number): boolean => {
			const entry = applied.find((item) => item.id === id)
			if (!entry || !editor || editor.isDestroyed) return false
			const { text } = buildTextIndex(editor.state.doc)
			return resolveSpan(text, entry.applied, entry.offset) !== null
		},
		[applied, editor],
	)

	return { pending, applied, accept, dismiss, acceptAll, revert, canRevert }
}
