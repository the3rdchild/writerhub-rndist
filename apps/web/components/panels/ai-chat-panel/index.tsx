'use client'

import { ArrowUp, Square, X } from 'lucide-react'
import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { useChat } from '@/features/chat/chat-context'
import { applyCommand, type ChatCommand, matchCommands } from '@/features/chat/commands'
import { useSelectionScope } from '@/features/editor/selection'
import { cn } from '@/lib/utils'
import { ChatCommandMenu } from '../chat-command-menu'
import { PanelError } from '../panel-parts'
import { ComposerToolbar } from './composer-toolbar'
import { MessageBubble } from './message-bubble'
import { StepTimeline, TaskSeparator } from './step-timeline'

export function AiChatPanel() {
	const {
		messages,
		streaming,
		steps,
		isRunning,
		error,
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
	useEffect(
		function scrollToLatestMessage() {
			const element = scrollRef.current
			if (element) element.scrollTop = element.scrollHeight
		},
		[messages, streaming, steps],
	)

	const submit = () => {
		if (!draft.trim() || isRunning) return
		send(draft)
		setDraft('')
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
								steps={message.steps}
								usage={message.usage}
								expired={!!message.taskId && message.taskId !== currentTaskId}
							/>
						</Fragment>
					)
				})}

				{streaming !== null && (
					<>
						{/* Lini masa langkah (§B1): proses yang sedang berjalan terlihat
						    sebelum jawaban muncul. */}
						{steps.length > 0 && <StepTimeline steps={steps} live />}
						<MessageBubble role="assistant" content={streaming} pending />
					</>
				)}

				{error && <PanelError message={error} />}
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
