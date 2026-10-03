'use client'

import { MessageSquare } from 'lucide-react'
import { useState } from 'react'
import { CommentThreadCard, PendingCommentCard } from '@/components/comments/comment-card'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
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
	const [pendingRemove, setPendingRemove] = useState<string | null>(null)

	const visible = comments.filter((thread) => showResolved || !thread.resolved)
	const resolvedCount = comments.filter((thread) => thread.resolved).length

	const open = (id: string) => {
		setActiveThread(id)
		if (editor) scrollToComment(editor, id)
	}

	// Utas yang diselesaikan juga ditutup, supaya sorotannya benar-benar hilang (SHL-17).
	const resolve = (id: string, resolved: boolean) => {
		setCommentResolved(id, resolved)
		if (resolved && activeThreadId === id) setActiveThread(null)
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
					title="No comments yet"
					description="Select a passage and choose Comment to start a thread"
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
					{showResolved ? 'Hide' : 'Show'} {resolvedCount} yang selesai
				</button>
			)}

			{visible.map((thread) => (
				<CommentThreadCard
					key={thread.id}
					thread={thread}
					active={thread.id === activeThreadId}
					onOpen={() => open(thread.id)}
					onResolve={() => resolve(thread.id, !thread.resolved)}
					onRemove={() => setPendingRemove(thread.id)}
				/>
			))}

			{/* Menghapus utas membuang semua balasannya - dulu terjadi tanpa bertanya (SHL-17). */}
			<ConfirmDialog
				open={pendingRemove !== null}
				danger
				title="Delete this comment thread?"
				description="The comment and all of its replies will be deleted. This can't be undone."
				confirmLabel="Delete"
				cancelLabel="Cancel"
				onConfirm={() => {
					if (pendingRemove) remove(pendingRemove)
					setPendingRemove(null)
				}}
				onCancel={() => setPendingRemove(null)}
			/>
		</div>
	)
}
