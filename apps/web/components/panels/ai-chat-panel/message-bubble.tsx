'use client'

import type { ChatUsage, ToolCall } from '@writer-hub/shared'
import { Check } from 'lucide-react'
import { useState } from 'react'
import { type ChatStep, extractProposals, stripProposals, useChat } from '@/features/chat/chat-context'
import { replaceTextRange } from '@/features/editor/apply-text'
import { useEditorInstance } from '@/features/editor/editor-context'
import { looksLikeMarkdown, markdownToHtml, toEditorContent } from '@/features/editor/markdown'
import { cn } from '@/lib/utils'
import { StepSummary } from './step-summary'
import { ActionGroup } from './tool-actions'

export function MessageBubble({
	role,
	content,
	pending,
	actions,
	steps,
	usage,
	expired,
}: {
	role: 'user' | 'assistant'
	content: string
	pending?: boolean
	actions?: ToolCall[]
	steps?: ChatStep[]
	usage?: ChatUsage
	expired?: boolean
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
	const emptyMarker = !pending && !prose && proposals.length === 0 && !(actions && actions.length > 0)

	return (
		<div className="flex flex-col gap-2">
			{/* Giliran selesai: lini masa menciut jadi ringkasan satu baris (§B1.3). */}
			{steps && steps.length > 0 && <StepSummary steps={steps} usage={usage} />}

			{prose &&
				(looksLikeMarkdown(prose) ? (
					<div className="chat-md text-sm leading-relaxed text-foreground">
						<div dangerouslySetInnerHTML={{ __html: markdownToHtml(prose) }} />
						{pending && <span className="animate-pulse text-accent">▍</span>}
					</div>
				) : (
					<p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground">
						{prose}
						{pending && <span className="ml-0.5 animate-pulse text-accent">▍</span>}
					</p>
				))}

			{emptyMarker && <p className="text-xs italic text-subtle">No response.</p>}

			{/* Selama masih mengalir, blok usulan belum tentu utuh - tombol Apply
			    baru muncul setelah gilirannya selesai. */}
			{!pending &&
				proposals.map((proposal, index) => (
					<ProposalCard key={`${index}-${proposal.slice(0, 24)}`} text={proposal} expired={expired} />
				))}

			{actions && actions.length > 0 && <ActionGroup actions={actions} expired={expired} />}
		</div>
	)
}

export function ProposalCard({ text, expired }: { text: string; expired?: boolean }) {
	const { editor } = useEditorInstance()
	const { attachment } = useChat()
	const [applied, setApplied] = useState(false)
	const [failed, setFailed] = useState(false)
	const [confirming, setConfirming] = useState(false)

	const apply = () => {
		if (!editor) return

		if (!attachment) {
			editor.chain().focus().insertContent(toEditorContent(text)).run()
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

	const onClick = () => {
		if (expired && !confirming) {
			setConfirming(true)
			return
		}
		apply()
	}

	return (
		<div className="flex flex-col gap-2 rounded-xl bg-surface-raised p-3">
			{looksLikeMarkdown(text) ? (
				<div
					className="chat-md text-xs leading-relaxed text-emerald-300"
					dangerouslySetInnerHTML={{ __html: markdownToHtml(text) }}
				/>
			) : (
				<p className="whitespace-pre-wrap break-words text-xs leading-relaxed text-emerald-300">{text}</p>
			)}

			{failed ? (
				<p className="text-[11px] text-yellow-400">
					The original text has changed - reselect the passage and try again
				</p>
			) : (
				<button
					type="button"
					onClick={onClick}
					disabled={applied}
					className={cn(
						'flex items-center justify-center gap-1 rounded-lg py-1.5 text-xs transition-colors',
						applied
							? 'cursor-default bg-green-500/10 text-green-400/60'
							: expired
								? 'bg-yellow-500/15 text-yellow-400 hover:bg-yellow-500/25'
								: 'bg-green-500/15 text-green-400 hover:bg-green-500/25',
					)}
				>
					<Check className="h-3.5 w-3.5" />
					{applied ? 'Applied' : expired ? (confirming ? 'Confirm?' : 'Apply') : 'Apply'}
				</button>
			)}
		</div>
	)
}
