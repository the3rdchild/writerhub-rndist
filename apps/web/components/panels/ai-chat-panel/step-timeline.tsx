'use client'
import { Ban, Check, Loader2, TriangleAlert } from 'lucide-react'
import { useEffect, useState } from 'react'
import { type ChatStep } from '@/features/chat/chat-context'
import { cn } from '@/lib/utils'
import { ResearchSourcesCard } from '../research-sources-card'

export function TaskSeparator() {
	return (
		<div className="flex items-center gap-2 py-1" role="separator" aria-label="New topic">
			<span className="h-px flex-1 bg-foreground/10" />
			<span className="text-[10px] uppercase tracking-wide text-subtle">New topic</span>
			<span className="h-px flex-1 bg-foreground/10" />
		</div>
	)
}

export function formatDuration(step: ChatStep, now: number): string {
	const ms = (step.endedAt ?? now) - step.startedAt
	return `${(Math.max(0, ms) / 1000).toFixed(1).replace('.', ',')} dtk`
}

export function StepIcon({ status }: { status: ChatStep['status'] }) {
	switch (status) {
		case 'running':
			return <Loader2 className="h-3 w-3 shrink-0 animate-spin text-accent" />
		case 'done':
			return <Check className="h-3 w-3 shrink-0 text-green-400" />
		case 'failed':
			return <TriangleAlert className="h-3 w-3 shrink-0 text-yellow-400" />
		case 'cancelled':
			return <Ban className="h-3 w-3 shrink-0 text-subtle" />
	}
}

export function StepTimeline({ steps, live }: { steps: ChatStep[]; live?: boolean }) {
	const [open, setOpen] = useState<string | null>(null)
	const [now, setNow] = useState(() => Date.now())
	useEffect(
		function tickElapsedTimer() {
			if (!live) return
			const timer = setInterval(() => setNow(Date.now()), 1000)
			return () => clearInterval(timer)
		},
		[live],
	)

	return (
		<div className="flex flex-col gap-0.5 rounded-xl bg-surface-raised p-2">
			{steps.map((step) => (
				<div key={step.id}>
					<button
						type="button"
						onClick={() => setOpen(open === step.id ? null : step.id)}
						className="flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left transition-colors hover:bg-[var(--overlay-hover)]"
					>
						<StepIcon status={step.status} />
						<span
							className={cn(
								'min-w-0 flex-1 truncate text-xs',
								step.status === 'running' ? 'text-foreground' : 'text-muted',
							)}
						>
							{step.label}
						</span>
						<span className="shrink-0 text-[10px] tabular-nums text-faint">{formatDuration(step, now)}</span>
					</button>
					{step.sources && step.sources.length > 0 && <ResearchSourcesCard sources={step.sources} />}
					{open === step.id && step.checklist && (
						<div className="mx-1.5 mb-1 flex flex-col gap-0.5 rounded-md bg-surface-inset px-2 py-1.5">
							{step.checklist.map((item, index) => (
								<span
									key={index}
									className="flex items-center gap-1.5 text-[11px] leading-relaxed text-subtle"
								>
									{item.done ? (
										<Check className="h-3 w-3 shrink-0 text-green-400" />
									) : (
										<span className="h-3 w-3 shrink-0 rounded-full border border-faint" />
									)}
									<span className={cn(item.done && 'line-through opacity-60')}>{item.text}</span>
								</span>
							))}
						</div>
					)}
					{open === step.id && !step.checklist && step.detail && (
						<p className="mx-1.5 mb-1 whitespace-pre-wrap break-words rounded-md bg-surface-inset px-2 py-1.5 font-mono text-[11px] leading-relaxed text-subtle">
							{step.detail}
						</p>
					)}
				</div>
			))}
		</div>
	)
}
