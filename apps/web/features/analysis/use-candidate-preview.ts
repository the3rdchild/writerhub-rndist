'use client'

import type { TextChange } from '@writer-hub/shared'
import { useCallback, useEffect, useState } from 'react'
import { useEditorInstance } from '@/features/editor/editor-context'
import { type CandidatePreview, candidatePreviewKey } from './candidate-preview'

interface PreviewSelection {
	index: number
	candidate: number
}

export function useCandidatePreview() {
	const { editor } = useEditorInstance()
	const [preview, setPreview] = useState<PreviewSelection | null>(null)

	const send = useCallback(
		(payload: CandidatePreview | null) => {
			if (!editor || editor.isDestroyed) return
			editor.view.dispatch(editor.state.tr.setMeta(candidatePreviewKey, payload))
		},
		[editor],
	)

	const clearPreview = useCallback(() => {
		setPreview(null)
		send(null)
	}, [send])

	const showPreview = useCallback(
		(index: number, candidate: number, change: TextChange) => {
			const text = change.candidates?.[candidate]
			if (!text) return
			setPreview({ index, candidate })
			send({
				offset: change.offset,
				length: change.length,
				original: change.original,
				candidate: text,
			})
		},
		[send],
	)
	useEffect(() => {
		if (!preview) return
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key === 'Escape') clearPreview()
		}
		window.addEventListener('keydown', onKeyDown)
		return () => window.removeEventListener('keydown', onKeyDown)
	}, [preview, clearPreview])
	useEffect(() => clearPreview, [clearPreview])

	return { preview, showPreview, clearPreview }
}
