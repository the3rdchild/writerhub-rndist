'use client'

import { Check, Replace, SendHorizontal, Trash2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { authorColor, authorInitials } from '@/features/comments/author'
import { useComments } from '@/features/comments/comments-context'
import type { CommentThread } from '@/features/sessions/session-context'
import { cn } from '@/lib/utils'
export function CommentAvatar({
	name,
	id,
	size = 20,
}: {
	name: string
	id?: string
	size?: number
}) {
	return (
		<span
			aria-hidden="true"
			className="flex shrink-0 items-center justify-center rounded-full font-semibold text-white"
			style={{
				width: size,
				height: size,
				fontSize: size * 0.42,
				backgroundColor: authorColor(id ?? name),
			}}
		>
			{authorInitials(name)}
		</span>
	)
}
function CommentComposer({
	value,
	placeholder,
	autoFocus,
	submitLabel,
	onChange,
	onSubmit,
	onCancel,
}: {
	value: string
	placeholder: string
	autoFocus?: boolean
	submitLabel?: string
	onChange: (text: string) => void
	onSubmit: () => void
	onCancel?: () => void
}) {
	const ref = useRef<HTMLTextAreaElement>(null)
	useEffect(() => {
		const node = ref.current
		if (!node) return
		node.style.height = 'auto'
		node.style.height = `${Math.min(node.scrollHeight, 160)}px`
	}, [value])

	const filled = value.trim().length > 0

	return (
		<div className="flex flex-col gap-1.5">
			<textarea
				ref={ref}
				value={value}
				rows={1}
				autoFocus={autoFocus}
				onChange={(event) => onChange(event.target.value)}
				onKeyDown={(event) => {
					if (event.key === 'Enter' && !event.shiftKey) {
						event.preventDefault()
						onSubmit()
						return
					}
					if (event.key === 'Escape' && onCancel) {
						event.preventDefault()
						onCancel()
					}
				}}
				placeholder={placeholder}
				className="w-full resize-none rounded-lg bg-[var(--overlay-hover)] px-2 py-1.5 text-xs leading-relaxed text-foreground outline-none placeholder:text-faint focus:ring-1 focus:ring-accent/40"
			/>

			<div className="flex items-center justify-end gap-1.5">
				{onCancel && (
					<button
						type="button"
						onClick={onCancel}
						className="rounded-md px-2 py-1 text-[11px] text-subtle transition-colors hover:bg-[var(--overlay-hover)] hover:text-foreground"
					>
						Batal
					</button>
				)}
				<button
					type="button"
					onClick={onSubmit}
					disabled={!filled}
					title={submitLabel ?? 'Kirim (Enter)'}
					aria-label={submitLabel ?? 'Kirim komentar'}
					className={cn(
						'flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-medium transition-colors',
						filled
							? 'bg-accent text-white hover:opacity-90'
							: 'cursor-not-allowed bg-[var(--overlay-hover)] text-faint',
					)}
				>
					{submitLabel ?? <SendHorizontal className="h-3.5 w-3.5" />}
				</button>
			</div>
		</div>
	)
}
export function PendingCommentCard({
	author,
	quote,
	className,
}: {
	author: string
	quote: string
	className?: string
}) {
	const { draftFor, setDraft, submitPending, cancelPending, PENDING_KEY } = useComments()

	return (
		<div
			className={cn(
				'flex flex-col gap-2 rounded-xl bg-surface-raised p-3 ring-1 ring-accent/40',
				className,
			)}
		>
			<div className="flex items-center gap-2">
				<CommentAvatar name={author} />
				<span className="truncate text-[11px] font-medium text-foreground">{author}</span>
			</div>

			<p className="border-l-2 border-accent/50 pl-2 text-[11px] italic leading-relaxed text-subtle">
				{quote}
			</p>

			<CommentComposer
				value={draftFor(PENDING_KEY)}
				onChange={(text) => setDraft(PENDING_KEY, text)}
				onSubmit={() => submitPending()}
				onCancel={cancelPending}
				placeholder="Tulis komentar…"
				submitLabel="Komentari"
				autoFocus
			/>
		</div>
	)
}
function SuggestionSection({ thread }: { thread: CommentThread }) {
	const { draftFor, setDraft, markedText, proposeSuggestion, acceptSuggestion, rejectSuggestion } =
		useComments()

	const [composing, setComposing] = useState(false)
	const draftKey = `suggestion:${thread.id}`
	const proposal = thread.suggestion

	const startComposing = () => {
		if (!draftFor(draftKey)) setDraft(draftKey, markedText(thread.id) ?? thread.quote)
		setComposing(true)
	}

	if (proposal?.status) {
		const accepted = proposal.status === 'accepted'
		return (
			<div className="flex flex-col gap-1 rounded-lg bg-[var(--overlay-hover)] p-2">
				<span
					className={cn(
						'text-[10px] font-medium',
						accepted ? 'text-green-400' : 'text-subtle',
					)}
				>
					Usulan {proposal.author} {accepted ? 'diterapkan' : 'ditolak'}
				</span>
				{accepted && proposal.replaced && (
					<p className="break-words text-[11px] leading-relaxed text-faint line-through">
						{proposal.replaced}
					</p>
				)}
				<p
					className={cn(
						'break-words text-[11px] leading-relaxed',
						accepted ? 'text-foreground' : 'text-faint line-through',
					)}
				>
					{proposal.text}
				</p>
			</div>
		)
	}

	if (proposal) {
		return (
			<div className="flex flex-col gap-1.5 rounded-lg bg-[var(--overlay-hover)] p-2">
				<span className="text-[10px] font-medium text-accent">
					{proposal.author} mengusulkan perubahan
				</span>
				<p className="break-words text-[11px] leading-relaxed text-faint line-through">
					{markedText(thread.id) ?? thread.quote}
				</p>
				<p className="break-words text-[11px] leading-relaxed text-foreground">{proposal.text}</p>
				<div className="flex items-center justify-end gap-1.5">
					<button
						type="button"
						onClick={() => rejectSuggestion(thread.id)}
						className="rounded-md px-2 py-1 text-[11px] text-subtle transition-colors hover:bg-[var(--overlay-active)] hover:text-foreground"
					>
						Tolak
					</button>
					<button
						type="button"
						onClick={() => acceptSuggestion(thread.id)}
						className="rounded-md bg-accent px-2 py-1 text-[11px] font-medium text-white transition-opacity hover:opacity-90"
					>
						Terapkan
					</button>
				</div>
			</div>
		)
	}

	if (composing) {
		return (
			<div className="flex flex-col gap-1.5 rounded-lg bg-[var(--overlay-hover)] p-2">
				<span className="text-[10px] font-medium text-subtle">Teks pengganti</span>
				<CommentComposer
					value={draftFor(draftKey)}
					onChange={(text) => setDraft(draftKey, text)}
					onSubmit={() => {
						proposeSuggestion(thread.id, draftFor(draftKey))
						setDraft(draftKey, '')
						setComposing(false)
					}}
					onCancel={() => setComposing(false)}
					placeholder="Tulis penggantinya…"
					submitLabel="Usulkan"
					autoFocus
				/>
			</div>
		)
	}

	return (
		<button
			type="button"
			onClick={startComposing}
			className="flex items-center gap-1.5 self-start rounded-md px-1 py-0.5 text-[11px] text-subtle transition-colors hover:text-foreground"
		>
			<Replace className="h-3 w-3" />
			Usulkan perubahan
		</button>
	)
}
export function CommentThreadCard({
	thread,
	active,
	className,
	onOpen,
	onResolve,
	onRemove,
}: {
	thread: CommentThread
	active?: boolean
	className?: string
	onOpen: () => void
	onResolve: () => void
	onRemove: () => void
}) {
	const { draftFor, setDraft, submitDraft } = useComments()
	const draft = draftFor(thread.id)
	const opener = thread.author ?? thread.replies[0]?.author ?? 'Tidak diketahui'
	const openerId = thread.authorId ?? thread.replies[0]?.authorId
	const resolve = () => {
		submitDraft(thread.id)
		onResolve()
	}

	return (
		<div
			className={cn(
				'flex flex-col gap-2 rounded-xl bg-surface-raised p-3 transition-all',
				thread.resolved && 'opacity-60',
				active && 'ring-1 ring-accent/40',
				className,
			)}
		>
			<div className="flex items-center gap-2">
				<CommentAvatar name={opener} id={openerId} />
				<span className="min-w-0 flex-1 truncate text-[11px] font-medium text-foreground">
					{opener}
				</span>
				<button
					type="button"
					onClick={resolve}
					title={thread.resolved ? 'Buka lagi' : 'Selesaikan'}
					aria-label={thread.resolved ? 'Buka lagi' : 'Selesaikan'}
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
					title="Hapus utas"
					aria-label="Hapus utas"
					className="rounded-md p-1 text-faint transition-colors hover:text-red-400"
				>
					<Trash2 className="h-3.5 w-3.5" />
				</button>
			</div>

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

			<SuggestionSection thread={thread} />

			<CommentComposer
				value={draft}
				onChange={(text) => setDraft(thread.id, text)}
				onSubmit={() => submitDraft(thread.id)}
				placeholder="Balas…"
			/>
		</div>
	)
}
