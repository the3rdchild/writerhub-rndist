'use client'

import { Check, MessageSquare, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { COMMENT_MARK } from '@/features/comments/comment-mark'
import { useEditorInstance } from '@/features/editor/editor-context'
import { type CommentThread, useSessions } from '@/features/sessions/session-context'
import { useSettings } from '@/features/settings/settings-context'
import { cn } from '@/lib/utils'
import { PanelEmptyState } from './panel-parts'

/**
 * Komentar pada tab yang sedang dibuka.
 *
 * Jangkarnya adalah mark di dalam naskah, jadi klik sebuah utas berarti mencari
 * mark bernama sama - bukan menyimpan posisi yang harus dipelihara sendiri
 * setiap kali teks di atasnya berubah.
 */
export function CommentsPanel() {
	const { comments, replyToComment, setCommentResolved, removeComment } = useSessions()
	const { editor } = useEditorInstance()
	const { settings } = useSettings()
	const [showResolved, setShowResolved] = useState(false)

	const visible = comments.filter((thread) => showResolved || !thread.resolved)
	const resolvedCount = comments.filter((thread) => thread.resolved).length

	const scrollTo = (id: string) => {
		if (!editor) return

		let found: number | null = null
		editor.state.doc.descendants((node, pos) => {
			if (found !== null || !node.isText) return
			const mark = node.marks.find(
				(candidate) => candidate.type.name === COMMENT_MARK && candidate.attrs.commentId === id,
			)
			if (mark) found = pos
		})

		if (found === null) return
		editor.chain().focus().setTextSelection(found).run()
		const dom = editor.view.domAtPos(found).node
		const element = dom instanceof HTMLElement ? dom : dom.parentElement
		element?.scrollIntoView({ behavior: 'smooth', block: 'center' })
	}

	const remove = (id: string) => {
		editor?.chain().focus().unsetComment(id).run()
		removeComment(id)
	}

	if (comments.length === 0) {
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
			{resolvedCount > 0 && (
				<button
					type="button"
					onClick={() => setShowResolved(!showResolved)}
					className="self-start px-1 text-[11px] text-subtle transition-colors hover:text-foreground"
				>
					{showResolved ? 'Hide' : 'Show'} {resolvedCount} resolved
				</button>
			)}

			{visible.map((thread) => (
				<ThreadCard
					key={thread.id}
					thread={thread}
					author={settings.profile.name}
					onOpen={() => scrollTo(thread.id)}
					onReply={(text) => replyToComment(thread.id, { author: settings.profile.name, text, at: Date.now() })}
					onResolve={() => setCommentResolved(thread.id, !thread.resolved)}
					onRemove={() => remove(thread.id)}
				/>
			))}
		</div>
	)
}

function ThreadCard({
	thread,
	author,
	onOpen,
	onReply,
	onResolve,
	onRemove,
}: {
	thread: CommentThread
	author: string
	onOpen: () => void
	onReply: (text: string) => void
	onResolve: () => void
	onRemove: () => void
}) {
	const [draft, setDraft] = useState('')

	const submit = () => {
		const trimmed = draft.trim()
		if (!trimmed) return
		onReply(trimmed)
		setDraft('')
	}

	return (
		<div
			className={cn(
				'flex flex-col gap-2 rounded-xl bg-surface-raised p-3 transition-opacity',
				thread.resolved && 'opacity-60',
			)}
		>
			<button
				type="button"
				onClick={onOpen}
				className="border-l-2 border-accent/50 pl-2 text-left text-[11px] italic leading-relaxed text-subtle transition-colors hover:text-foreground"
			>
				{thread.quote}
			</button>

			{thread.replies.map((reply, index) => (
				<div key={`${index}-${reply.at}`} className="flex flex-col gap-0.5">
					<span className="text-[10px] font-medium text-accent">{reply.author}</span>
					<p className="whitespace-pre-wrap break-words text-xs leading-relaxed text-foreground">
						{reply.text}
					</p>
				</div>
			))}

			<div className="flex items-center gap-1.5">
				<input
					value={draft}
					onChange={(event) => setDraft(event.target.value)}
					onKeyDown={(event) => {
						if (event.key === 'Enter') {
							event.preventDefault()
							submit()
						}
					}}
					placeholder={thread.replies.length === 0 ? 'Add a comment…' : 'Reply…'}
					aria-label={`Reply as ${author}`}
					className="min-w-0 flex-1 rounded-lg bg-[var(--overlay-hover)] px-2 py-1.5 text-xs text-foreground outline-none placeholder:text-faint"
				/>
				<button
					type="button"
					onClick={onResolve}
					title={thread.resolved ? 'Reopen' : 'Resolve'}
					aria-label={thread.resolved ? 'Reopen' : 'Resolve'}
					className={cn(
						'rounded-md p-1 transition-colors',
						thread.resolved ? 'text-green-400' : 'text-faint hover:text-green-400',
					)}
				>
					<Check className="h-3.5 w-3.5" />
				</button>
				<button
					type="button"
					onClick={onRemove}
					title="Delete"
					aria-label="Delete comment"
					className="rounded-md p-1 text-faint transition-colors hover:text-red-400"
				>
					<Trash2 className="h-3.5 w-3.5" />
				</button>
			</div>
		</div>
	)
}
