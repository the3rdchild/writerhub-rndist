'use client'

import { ArrowDown, ArrowUp, Square, X } from 'lucide-react'
import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { useChat } from '@/features/chat/chat-context'
import { applyCommand, type ChatCommand, matchCommands } from '@/features/chat/commands'
import { useSelectionScope } from '@/features/editor/selection'
import { cn } from '@/lib/utils'
import { ChatCommandMenu } from '../chat-command-menu'
import { ComposerToolbar } from './composer-toolbar'
import { MessageBubble } from './message-bubble'
import { TaskSeparator } from './step-timeline'
import { TurnError } from './turn-error'

/**
 * Sejauh apa dari dasar masih dihitung "sedang mengikuti".
 *
 * Bukan nol: menggulir dengan roda tetikus jarang berhenti persis di dasar,
 * dan sisa beberapa piksel tidak berarti penulis sedang membaca ke atas.
 */
const FOLLOW_THRESHOLD_PX = 48

export function AiChatPanel() {
	const {
		messages,
		streaming,
		parts,
		isRunning,
		error,
		retry,
		attachment,
		attach,
		clearAttachment,
		includeDocument,
		setIncludeDocument,
		send,
		stop,
		reset,
		startNewTopic,
		currentTaskId,
		autoApply,
		setAutoApply,
		research,
		setResearch,
	} = useChat()

	const [draft, setDraft] = useState('')
	const commands = useMemo(() => matchCommands(draft), [draft])
	const [activeCommand, setActiveCommand] = useState(0)
	const draftRef = useRef<HTMLTextAreaElement>(null)
	const scrollRef = useRef<HTMLDivElement>(null)
	/*
	 * Dipegang dua kali karena dua pembacanya berbeda umur: efek di bawah
	 * berjalan sesudah render dan butuh nilai terkini (ref), sedangkan tombol
	 * "kembali ke bawah" perlu render ulang saat nilainya berubah (state).
	 * Pola yang sama dipakai `chat-context.tsx` untuk langkah.
	 */
	const followingRef = useRef(true)
	const [following, setFollowing] = useState(true)
	const scope = useSelectionScope()
	const dismissedRef = useRef<string | null>(null)
	const selectionKey = scope ? `${scope.offset}:${scope.length}` : null

	useEffect(
		function attachSelectionToPrompt() {
			if (!scope || selectionKey === null || dismissedRef.current === selectionKey) return
			if (isRunning) {
				dismissedRef.current = selectionKey
				return
			}

			attach({
				text: scope.text,
				surrounding: scope.surrounding,
				offset: scope.offset,
				length: scope.length,
			})
		},
		[scope, selectionKey, attach, isRunning],
	)

	const dismissAttachment = () => {
		dismissedRef.current = selectionKey
		clearAttachment()
	}
	const setFollowingBoth = (next: boolean) => {
		followingRef.current = next
		setFollowing(next)
	}

	const jumpToLatest = () => {
		const element = scrollRef.current
		if (element) element.scrollTop = element.scrollHeight
		setFollowingBoth(true)
	}

	/*
	 * Menempel ke dasar hanya selama penulis memang berada di sana.
	 *
	 * Sebelumnya baris ini memaksa `scrollTop = scrollHeight` tanpa syarat, dan
	 * `steps` ikut jadi pemicunya - berarti selama model bekerja, panel ditarik
	 * kembali ke dasar tiap kali satu langkah bertambah. Menggulir ke atas untuk
	 * membaca ulang jadi mustahil, bukan sekadar sulit.
	 */
	const onScroll = () => {
		const element = scrollRef.current
		if (!element) return
		const fromBottom = element.scrollHeight - element.scrollTop - element.clientHeight
		setFollowingBoth(fromBottom <= FOLLOW_THRESHOLD_PX)
	}

	useEffect(
		function followLatestMessage() {
			if (!followingRef.current) return
			const element = scrollRef.current
			if (element) element.scrollTop = element.scrollHeight
		},
		[messages, streaming, parts],
	)

	const submit = () => {
		if (!draft.trim() || isRunning) return
		send(draft)
		setDraft('')
		// Mengirim pesan adalah pernyataan bahwa penulis kembali mengikuti.
		setFollowingBoth(true)
	}

	const pickCommand = (command: ChatCommand) => {
		if (command.enablesResearch) setResearch(true)
		setDraft(applyCommand(command))
		setActiveCommand(0)
		draftRef.current?.focus()
	}

	const onDraftKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
		if (commands.length > 0) {
			if (event.key === 'ArrowDown') {
				event.preventDefault()
				setActiveCommand((at) => (at + 1) % commands.length)
				return
			}
			if (event.key === 'ArrowUp') {
				event.preventDefault()
				setActiveCommand((at) => (at - 1 + commands.length) % commands.length)
				return
			}
			if (event.key === 'Enter' || event.key === 'Tab') {
				event.preventDefault()
				pickCommand(commands[Math.min(activeCommand, commands.length - 1)])
				return
			}
			if (event.key === 'Escape') {
				event.preventDefault()
				setDraft('')
				return
			}
		}

		if (event.key === 'Enter' && !event.shiftKey) {
			event.preventDefault()
			submit()
		}
	}

	const isEmpty = messages.length === 0 && streaming === null

	return (
		<>
			<div
				ref={scrollRef}
				onScroll={onScroll}
				className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto bg-surface-inset p-4"
			>
				{isEmpty && (
					<div className="flex flex-1 flex-col items-center justify-center gap-1 px-4 text-center">
						<p className="text-sm font-medium text-foreground">Ask about your draft</p>
						<p className="text-xs text-subtle">Select a passage and send it here, or just ask a question</p>
					</div>
				)}

				{messages.map((message, index) => {
					if (message.role === 'tool') return null
					if (message.intermediate) return null

					const prev = messages[index - 1]
					const newTaskBoundary = index > 0 && message.taskId !== prev?.taskId

					return (
						<Fragment key={`${index}-${message.content.slice(0, 24)}`}>
							{newTaskBoundary && <TaskSeparator />}
							<MessageBubble
								role={message.role}
								content={message.content}
								actions={message.actions}
								parts={message.parts}
								usage={message.usage}
								expired={!!message.taskId && message.taskId !== currentTaskId}
							/>
						</Fragment>
					)
				})}

				{/*
				 * Giliran yang sedang berjalan digambar dengan komponen yang sama
				 * seperti giliran selesai - hanya `pending` yang berbeda. Dua
				 * penggambar untuk satu bentuk data adalah cara paling mudah
				 * membuat yang mengalir dan yang tersimpan terlihat berbeda.
				 */}
				{streaming !== null && <MessageBubble role="assistant" content={streaming} parts={parts} pending />}

				{error && <TurnError error={error} onRetry={retry} disabled={isRunning} />}

				{/*
				 * Jalan kembali ke dasar, karena melepas ikatan otomatis berarti
				 * penulis bisa tertinggal jauh tanpa cara cepat menyusul.
				 * `h-0` supaya ia melayang di atas percakapan alih-alih
				 * menyisipkan ruang yang menggeser isinya.
				 */}
				{!following && !isEmpty && (
					<div className="pointer-events-none sticky bottom-0 z-10 flex h-0 justify-center">
						<button
							type="button"
							onClick={jumpToLatest}
							className="pointer-events-auto -translate-y-2 flex items-center gap-1 rounded-full bg-surface-raised px-3 py-1.5 text-xs text-subtle shadow-sm transition-colors hover:bg-[var(--overlay-hover)]"
							aria-label="Jump to latest"
						>
							<ArrowDown className="h-3 w-3" />
							Latest
						</button>
					</div>
				)}
			</div>

			<div className="flex shrink-0 flex-col gap-2 px-4 py-3">
				{attachment && (
					<div className="flex items-start gap-2 rounded-xl bg-[var(--overlay-hover)] px-3 py-2">
						<span className="mt-0.5 shrink-0 text-[10px] font-semibold uppercase tracking-wide text-accent">
							Selection
						</span>
						<p className="min-w-0 flex-1 line-clamp-2 text-xs leading-relaxed text-muted">
							{attachment.text}
						</p>
						<button
							type="button"
							onClick={dismissAttachment}
							aria-label="Remove selection"
							className="shrink-0 text-subtle transition-colors hover:text-foreground"
						>
							<X className="h-3.5 w-3.5" />
						</button>
					</div>
				)}

				<ComposerToolbar />

				<ChatCommandMenu
					commands={commands}
					active={Math.min(activeCommand, Math.max(commands.length - 1, 0))}
					onPick={pickCommand}
					onHover={setActiveCommand}
				/>

				<div className="flex items-end gap-2 rounded-2xl bg-surface-raised p-2">
					<textarea
						ref={draftRef}
						value={draft}
						onChange={(event) => {
							setDraft(event.target.value)
							setActiveCommand(0)
						}}
						onKeyDown={onDraftKeyDown}
						rows={2}
						placeholder="Ask anything about this draft… atau ketik / untuk perintah"
						aria-label="Message"
						className="min-h-0 flex-1 resize-none bg-transparent px-2 py-1 text-sm text-foreground outline-none placeholder:text-faint"
					/>

					{isRunning ? (
						<button
							type="button"
							onClick={stop}
							aria-label="Stop"
							title="Stop"
							className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--overlay-active)] text-foreground"
						>
							<Square className="h-3.5 w-3.5" />
						</button>
					) : (
						<button
							type="button"
							onClick={submit}
							disabled={!draft.trim()}
							aria-label="Send"
							title="Send"
							className={cn(
								'flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors',
								draft.trim()
									? 'bg-accent text-accent-foreground hover:bg-accent-hover'
									: 'cursor-not-allowed bg-accent/30 text-white/50',
							)}
						>
							<ArrowUp className="h-4 w-4" />
						</button>
					)}
				</div>
			</div>
		</>
	)
}
