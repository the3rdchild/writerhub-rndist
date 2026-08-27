'use client'

import { useEffect } from 'react'
import { useEditorInstance } from '@/features/editor/editor-context'
import { useSessions } from '@/features/sessions/session-context'
import { commentRanges } from './anchors'

const SETTLE_MS = 1500
const GRACE_MS = 4000

export function usePruneOrphanComments(onPruned?: (id: string) => void): void {
	const { activeId, comments, removeComment } = useSessions()
	const { editor } = useEditorInstance()

	useEffect(
		function pruneOrphanComments() {
			if (!editor || editor.isDestroyed || !activeId) return

			const prune = () => {
				if (editor.isDestroyed) return
				if (editor.state.doc.textBetween(0, editor.state.doc.content.size, ' ').trim() === '') {
					return
				}

				const ranges = commentRanges(editor)
				const now = Date.now()

				for (const thread of comments) {
					if (thread.resolved) continue
					if (ranges.has(thread.id)) continue
					if (now - thread.createdAt < GRACE_MS) continue

					removeComment(thread.id)
					onPruned?.(thread.id)
				}
			}
			let timer = setTimeout(prune, SETTLE_MS)
			const restart = () => {
				clearTimeout(timer)
				timer = setTimeout(prune, SETTLE_MS)
			}

			editor.on('update', restart)
			return () => {
				clearTimeout(timer)
				editor.off('update', restart)
			}
		},
		[activeId, comments, editor, onPruned, removeComment],
	)
}
