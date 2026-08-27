'use client'

import type { Editor } from '@tiptap/core'
import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { buildTextIndex, textRangeToPM } from '@/features/document/tiptap-offsets'
import { useEditorInstance } from '@/features/editor/editor-context'
import { useSessions } from '@/features/sessions/session-context'
import { useSettings } from '@/features/settings/settings-context'
import { commentRange } from './anchors'
import { localAuthorId } from './author'
import { usePruneOrphanComments } from './use-prune-orphans'

export interface PendingComment {
	tabId: string
	from: number
	to: number
	quote: string
}

const PENDING_KEY = '__pending__'

function anchorRange(editor: Editor, pending: PendingComment): { from: number; to: number } | null {
	const size = editor.state.doc.content.size
	const from = Math.min(pending.from, size)
	const to = Math.min(pending.to, size)

	if (from < to) {
		const current = editor.state.doc.textBetween(from, to, ' ').slice(0, 300)
		if (current === pending.quote) return { from, to }
	}

	const index = buildTextIndex(editor.state.doc)
	const at = index.text.indexOf(pending.quote)
	if (at === -1) return null

	return textRangeToPM(index, at, pending.quote.length)
}

interface CommentsContextValue {
	pending: PendingComment | null
	startPending: (pending: Omit<PendingComment, 'tabId'>) => void
	cancelPending: () => void
	submitPending: () => string | null
	draftFor: (key: string) => string
	setDraft: (key: string, text: string) => void
	submitDraft: (threadId: string) => boolean
	PENDING_KEY: string
	markedText: (threadId: string) => string | null
	proposeSuggestion: (threadId: string, text: string) => void
	acceptSuggestion: (threadId: string) => boolean
	rejectSuggestion: (threadId: string) => void
	activeThreadId: string | null
	setActiveThread: (id: string | null) => void
}

const CommentsContext = createContext<CommentsContextValue | null>(null)

export function CommentsProvider({ children }: { children: ReactNode }) {
	const { activeId, comments, addComment, replyToComment, updateComment } = useSessions()
	const { editor } = useEditorInstance()
	const { settings } = useSettings()

	const [pending, setPending] = useState<PendingComment | null>(null)
	const [drafts, setDrafts] = useState<Record<string, string>>({})
	const [activeThreadId, setActiveThread] = useState<string | null>(null)
	const forgetThread = useCallback((id: string) => {
		setActiveThread((current) => (current === id ? null : current))
	}, [])
	usePruneOrphanComments(forgetThread)
	useEffect(
		function resetDraftsOnTabChange() {
			setPending(null)
			setDrafts({})
			setActiveThread(null)
		},
		[activeId],
	)
	useEffect(
		function paintActiveThreadMark() {
			if (!editor || editor.isDestroyed) return
			const view = editor.view

			const paint = () => {
				for (const node of view.dom.querySelectorAll('.comment-mark--active')) {
					node.classList.remove('comment-mark--active')
				}
				if (!activeThreadId) return

				const selector = `[data-comment-id="${CSS.escape(activeThreadId)}"]`
				for (const node of view.dom.querySelectorAll(selector)) {
					node.classList.add('comment-mark--active')
				}
			}

			paint()
			editor.on('update', paint)
			return () => {
				editor.off('update', paint)
			}
		},
		[activeThreadId, editor],
	)

	const startPending = useCallback(
		(next: Omit<PendingComment, 'tabId'>) => {
			if (!activeId) return
			setPending({ ...next, tabId: activeId })
			setActiveThread(null)
		},
		[activeId],
	)

	const cancelPending = useCallback(() => {
		setPending(null)
		setDrafts((current) => {
			if (!(PENDING_KEY in current)) return current
			const { [PENDING_KEY]: _dropped, ...rest } = current
			return rest
		})
	}, [])

	const setDraft = useCallback((key: string, text: string) => {
		setDrafts((current) => ({ ...current, [key]: text }))
	}, [])

	const draftFor = useCallback((key: string) => drafts[key] ?? '', [drafts])

	const submitPending = useCallback((): string | null => {
		const text = (drafts[PENDING_KEY] ?? '').trim()
		if (!pending || !text || !editor || editor.isDestroyed) return null
		if (pending.tabId !== activeId) return null

		const id = `c-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
		const authorId = localAuthorId()
		const author = settings.profile.name
		const range = anchorRange(editor, pending)
		if (!range) return null

		const applied = editor.chain().focus().setTextSelection(range).setComment(id).run()
		if (!applied) return null

		addComment({
			id,
			quote: pending.quote,
			author,
			authorId,
			replies: [{ author, authorId, text, at: Date.now() }],
			resolved: false,
			createdAt: Date.now(),
		})

		cancelPending()
		setActiveThread(id)
		return id
	}, [activeId, addComment, cancelPending, drafts, editor, pending, settings.profile.name])

	const submitDraft = useCallback(
		(threadId: string): boolean => {
			const text = (drafts[threadId] ?? '').trim()
			if (!text) return false

			replyToComment(threadId, {
				author: settings.profile.name,
				authorId: localAuthorId(),
				text,
				at: Date.now(),
			})
			setDraft(threadId, '')
			return true
		},
		[drafts, replyToComment, setDraft, settings.profile.name],
	)

	const markedText = useCallback(
		(threadId: string): string | null => {
			if (!editor || editor.isDestroyed) return null
			const range = commentRange(editor, threadId)
			if (!range) return null
			return editor.state.doc.textBetween(range.from, range.to, ' ')
		},
		[editor],
	)

	const proposeSuggestion = useCallback(
		(threadId: string, text: string) => {
			const trimmed = text.trim()
			if (!trimmed) return

			updateComment(threadId, {
				suggestion: {
					text: trimmed,
					author: settings.profile.name,
					authorId: localAuthorId(),
					at: Date.now(),
				},
			})
		},
		[settings.profile.name, updateComment],
	)
	const acceptSuggestion = useCallback(
		(threadId: string): boolean => {
			const thread = comments.find((candidate) => candidate.id === threadId)
			const proposal = thread?.suggestion
			if (!thread || !proposal || proposal.status || !editor || editor.isDestroyed) return false

			const range = commentRange(editor, threadId)
			if (!range) return false

			const replaced = editor.state.doc.textBetween(range.from, range.to, ' ')
			const applied = editor.chain().focus().insertContentAt(range, proposal.text).run()
			if (!applied) return false
			editor.chain().unsetComment(threadId).run()
			updateComment(threadId, {
				resolved: true,
				suggestion: { ...proposal, status: 'accepted', decidedAt: Date.now(), replaced },
			})
			setActiveThread(null)
			return true
		},
		[comments, editor, updateComment],
	)

	const rejectSuggestion = useCallback(
		(threadId: string) => {
			const proposal = comments.find((candidate) => candidate.id === threadId)?.suggestion
			if (!proposal || proposal.status) return
			updateComment(threadId, {
				suggestion: { ...proposal, status: 'rejected', decidedAt: Date.now() },
			})
		},
		[comments, updateComment],
	)

	const value = useMemo<CommentsContextValue>(
		() => ({
			pending,
			startPending,
			cancelPending,
			submitPending,
			draftFor,
			setDraft,
			submitDraft,
			PENDING_KEY,
			markedText,
			proposeSuggestion,
			acceptSuggestion,
			rejectSuggestion,
			activeThreadId,
			setActiveThread,
		}),
		[
			pending,
			startPending,
			cancelPending,
			submitPending,
			draftFor,
			setDraft,
			submitDraft,
			markedText,
			proposeSuggestion,
			acceptSuggestion,
			rejectSuggestion,
			activeThreadId,
		],
	)

	return <CommentsContext.Provider value={value}>{children}</CommentsContext.Provider>
}

export function useComments(): CommentsContextValue {
	const context = useContext(CommentsContext)
	if (!context) throw new Error('useComments harus dipakai di dalam <CommentsProvider>')
	return context
}
