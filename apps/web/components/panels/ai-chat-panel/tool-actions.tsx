'use client'

import type { ToolCall } from '@writer-hub/shared'
import { Check, SkipForward, Wand2 } from 'lucide-react'
import { useState } from 'react'
import { useChat } from '@/features/chat/chat-context'
import { describeToolCall } from '@/features/chat/tools'
import { cn } from '@/lib/utils'

export function ActionGroup({ actions, expired }: { actions: ToolCall[]; expired?: boolean }) {
	const { applyActions, isActionSettled } = useChat()
	const pending = actions.filter((call) => !isActionSettled(call.id))

	return (
		<div className="flex flex-col gap-2">
			{pending.length > 1 && !expired && (
				<button
					type="button"
					onClick={() => applyActions(pending)}
					className="flex items-center justify-center gap-1.5 rounded-full bg-green-500/15 py-1.5 text-xs font-medium text-green-400 transition-colors hover:bg-green-500/25"
				>
					<Check className="h-3.5 w-3.5" />
					Apply all ({pending.length})
				</button>
			)}
			{actions.map((call) => (
				<ActionCard key={call.id} call={call} expired={expired} />
			))}
		</div>
	)
}

export function ActionCard({ call, expired }: { call: ToolCall; expired?: boolean }) {
	const { applyAction, skipAction, isActionApplied, isActionSettled } = useChat()
	const applied = isActionApplied(call.id)
	const settled = isActionSettled(call.id)
	const [outcome, setOutcome] = useState<{ ok: boolean; message: string } | null>(null)
	const [confirming, setConfirming] = useState(false)

	const onClick = () => {
		if (expired && !confirming && !applied) {
			setConfirming(true)
			return
		}
		setOutcome(applyAction(call))
	}

	return (
		<div className="flex flex-col gap-2 rounded-xl border border-accent/20 bg-accent/5 p-3">
			<div className="flex items-start gap-2">
				<Wand2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent" />
				<p className="min-w-0 flex-1 text-xs leading-relaxed text-foreground">{describeToolCall(call)}</p>
			</div>

			{expired && !settled && <p className="text-[11px] italic text-subtle">From a previous request</p>}

			{applied ? (
				<p className="text-[11px] text-green-400/70">Applied</p>
			) : outcome ? (
				<p className={cn('text-[11px]', outcome.ok ? 'text-green-400' : 'text-yellow-400')}>
					{outcome.message}
				</p>
			) : settled ? (
				<p className="text-[11px] text-subtle">Skipped</p>
			) : (
				<div className="flex gap-1.5">
					<button
						type="button"
						onClick={onClick}
						className={cn(
							'flex flex-1 items-center justify-center gap-1 rounded-lg py-1.5 text-xs transition-colors',
							expired
								? 'bg-yellow-500/15 text-yellow-400 hover:bg-yellow-500/25'
								: 'bg-green-500/15 text-green-400 hover:bg-green-500/25',
						)}
					>
						<Check className="h-3.5 w-3.5" />
						{expired ? (confirming ? 'Confirm?' : 'Apply') : 'Apply'}
					</button>
					<button
						type="button"
						onClick={() => skipAction(call)}
						title="Don't apply this one - AI is still notified and continues"
						className="flex items-center justify-center gap-1 rounded-lg bg-[var(--overlay-hover)] px-3 py-1.5 text-xs text-muted transition-colors hover:text-foreground"
					>
						<SkipForward className="h-3.5 w-3.5" />
						Skip
					</button>
				</div>
			)}
		</div>
	)
}
