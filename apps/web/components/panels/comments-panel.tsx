'use client'

import { MessageSquare } from 'lucide-react'
import { useState } from 'react'
import { CommentThreadCard, PendingCommentCard } from '@/components/comments/comment-card'
import { scrollToComment } from '@/features/comments/anchors'
import { useComments } from '@/features/comments/comments-context'
import { useEditorInstance } from '@/features/editor/editor-context'
import { useSessions } from '@/features/sessions/session-context'
import { useSettings } from '@/features/settings/settings-context'
import { PanelEmptyState } from './panel-parts'
export function CommentsPanel() {
	const { comments, setCommentResolved, removeComment } = useSessions()
	const { editor } = useEditorInstance()
	const { settings } = useSettings()
	const { pending, activeThreadId, setActiveThread } = useComments()
	const [showResolved, setShowResolved] = useState(false)

	const visible = comments.filter((thread) => showResolved || !thread.resolved)
	const resolvedCount = comments.filter((thread) => thread.resolved).length

	const open = (id: string) => {
		setActiveThread(id)
		if (editor) scrollToComment(editor, id)
	}

	const remove = (id: string) => {
		editor?.chain().focus().unsetComment(id).run()
		removeComment(id)
		if (activeThreadId === id) setActiveThread(null)
	}

	if (comments.length === 0 && !pending) {
		return (
			<div className="flex min-h-0 flex-1 flex-col bg-surface-inset p-4">
				<PanelEmptyState
					icon={MessageSquare}
					title="Belum ada komentar"
					description="Sorot satu bagian naskah lalu pilih Comment untuk memulai utas"
				/>
			</div>
		)
	}

	return (
		<div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto bg-surface-inset p-3">
			{pending && <PendingCommentCard author={settings.profile.name} quote={pending.quote} />}

			{resolvedCount > 0 && (
				<button
					type="button"
					onClick={() => setShowResolved(!showResolved)}
					className="self-start px-1 text-[11px] text-subtle transition-colors hover:text-foreground"
				>
					{showResolved ? 'Sembunyikan' : 'Tampilkan'} {resolvedCount} yang selesai
				</button>
			)}

			{visible.map((thread) => (
				<CommentThreadCard
					key={thread.id}
					thread={thread}
					active={thread.id === activeThreadId}
					onOpen={() => open(thread.id)}
					onResolve={() => setCommentResolved(thread.id, !thread.resolved)}
					onRemove={() => remove(thread.id)}
				/>
			))}
		</div>
	)
}
