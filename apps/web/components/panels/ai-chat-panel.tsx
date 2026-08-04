'use client'

import { ArrowUp, Check, FileText, Square, Trash2, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { extractProposals, stripProposals, useChat } from '@/features/chat/chat-context'
import { replaceTextRange } from '@/features/editor/apply-text'
import { useEditorInstance } from '@/features/editor/editor-context'
import { useSelectionScope } from '@/features/editor/selection'
import { cn } from '@/lib/utils'
import { PanelError } from './panel-parts'

/**
 * Percakapan tentang naskah yang sedang dibuka.
 *
 * Berbeda dari modul lain yang menjalankan satu analisis atas seluruh dokumen,
 * panel ini bergiliran: pengguna bertanya, jawabannya mengalir masuk. Usulan
 * teks datang sebagai kartu ber-Apply - idiom yang sama dengan kartu saran di
 * modul lain, supaya tidak ada suntingan yang terjadi tanpa dilihat.
 */
export function AiChatPanel() {
	const {
		messages,
		streaming,
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
	} = useChat()

	const [draft, setDraft] = useState('')
	const scrollRef = useRef<HTMLDivElement>(null)

	/*
	 * Seleksi yang sedang aktif menempel sendiri, sama seperti panel lain yang
	 * mengarahkan Run-nya ke potongan terpilih.
	 *
	 * Yang sudah dilepas pengguna diingat supaya tidak langsung menempel lagi —
	 * tanpa itu tombol × tidak akan pernah berhasil selama seleksinya masih ada.
	 */
	const scope = useSelectionScope()
	const dismissedRef = useRef<string | null>(null)
	const selectionKey = scope ? `${scope.offset}:${scope.length}` : null

	useEffect(() => {
		if (!scope || selectionKey === null || dismissedRef.current === selectionKey) return
		attach({
			text: scope.text,
			surrounding: scope.surrounding,
			offset: scope.offset,
			length: scope.length,
		})
	}, [scope, selectionKey, attach])

	const dismissAttachment = () => {
		dismissedRef.current = selectionKey
		clearAttachment()
	}

	// Jawaban yang mengalir harus tetap terlihat tanpa pengguna menggulung.
	useEffect(() => {
		const element = scrollRef.current
		if (element) element.scrollTop = element.scrollHeight
	}, [messages, streaming])

	const submit = () => {
		if (!draft.trim() || isRunning) return
		send(draft)
		setDraft('')
	}

	const isEmpty = messages.length === 0 && streaming === null

	return (
		<>
			<div ref={scrollRef} className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto bg-surface-inset p-4">
				{isEmpty && (
					<div className="flex flex-1 flex-col items-center justify-center gap-1 px-4 text-center">
						<p className="text-sm font-medium text-foreground">Ask about your draft</p>
						<p className="text-xs text-subtle">
							Select a passage and send it here, or just ask a question
						</p>
					</div>
				)}

				{messages.map((message, index) => (
					<Bubble
						key={`${index}-${message.content.slice(0, 24)}`}
						role={message.role}
						content={message.content}
					/>
				))}

				{streaming !== null && <Bubble role="assistant" content={streaming} pending />}

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

				<div className="flex items-center gap-2">
					<button
						type="button"
						onClick={() => setIncludeDocument(!includeDocument)}
						title="Send the whole document as context"
						className={cn(
							'flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] transition-colors',
							includeDocument
								? 'bg-accent/15 text-accent'
								: 'text-subtle hover:bg-[var(--overlay-hover)] hover:text-foreground',
						)}
					>
						<FileText className="h-3 w-3" />
						Whole document
					</button>

					{messages.length > 0 && (
						<button
							type="button"
							onClick={reset}
							title="Clear conversation"
							aria-label="Clear conversation"
							className="ml-auto rounded-md p-1 text-subtle transition-colors hover:text-foreground"
						>
							<Trash2 className="h-3.5 w-3.5" />
						</button>
					)}
				</div>

				<div className="flex items-end gap-2 rounded-2xl bg-surface-raised p-2">
					<textarea
						value={draft}
						onChange={(event) => setDraft(event.target.value)}
						onKeyDown={(event) => {
							// Enter mengirim; Shift+Enter untuk baris baru, seperti kotak
							// pesan pada umumnya.
							if (event.key === 'Enter' && !event.shiftKey) {
								event.preventDefault()
								submit()
							}
						}}
						rows={2}
						placeholder="Ask anything about this draft…"
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

function Bubble({
	role,
	content,
	pending,
}: {
	role: 'user' | 'assistant'
	content: string
	pending?: boolean
}) {
	const proposals = role === 'assistant' ? extractProposals(content) : []
	const prose = role === 'assistant' ? stripProposals(content) : content

	if (role === 'user') {
		return (
			<div className="self-end rounded-2xl rounded-br-sm bg-accent px-3 py-2 text-sm text-accent-foreground max-w-[85%]">
				<p className="whitespace-pre-wrap break-words">{content}</p>
			</div>
		)
	}

	return (
		<div className="flex flex-col gap-2">
			{prose && (
				<p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground">
					{prose}
					{pending && <span className="ml-0.5 animate-pulse text-accent">▍</span>}
				</p>
			)}

			{/* Selama masih mengalir, blok usulan belum tentu utuh - tombol Apply
			    baru muncul setelah gilirannya selesai. */}
			{!pending &&
				proposals.map((proposal, index) => (
					<ProposalCard key={`${index}-${proposal.slice(0, 24)}`} text={proposal} />
				))}
		</div>
	)
}

function ProposalCard({ text }: { text: string }) {
	const { editor } = useEditorInstance()
	const { attachment } = useChat()
	const [applied, setApplied] = useState(false)
	const [failed, setFailed] = useState(false)

	const apply = () => {
		if (!editor) return

		if (!attachment) {
			// Tanpa seleksi yang ditempel, tidak ada rentang yang jelas untuk
			// diganti - usulannya disisipkan di posisi kursor.
			editor.chain().focus().insertContent(text).run()
			setApplied(true)
			return
		}

		const ok = replaceTextRange(
			editor,
			{ offset: attachment.offset, length: attachment.length, expected: attachment.text },
			text,
		)
		if (ok) setApplied(true)
		else setFailed(true)
	}

	return (
		<div className="flex flex-col gap-2 rounded-xl bg-surface-raised p-3">
			<p className="whitespace-pre-wrap break-words text-xs leading-relaxed text-emerald-300">{text}</p>

			{failed ? (
				<p className="text-[11px] text-yellow-400">
					Teks aslinya sudah berubah - pilih ulang bagiannya lalu coba lagi
				</p>
			) : (
				<button
					type="button"
					onClick={apply}
					disabled={applied}
					className={cn(
						'flex items-center justify-center gap-1 rounded-lg py-1.5 text-xs transition-colors',
						applied
							? 'cursor-default bg-green-500/10 text-green-400/60'
							: 'bg-green-500/15 text-green-400 hover:bg-green-500/25',
					)}
				>
					<Check className="h-3.5 w-3.5" />
					{applied ? 'Applied' : 'Apply'}
				</button>
			)}
		</div>
	)
}
