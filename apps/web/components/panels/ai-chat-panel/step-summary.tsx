'use client'

import type { ChatUsage } from '@writer-hub/shared'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { useState } from 'react'
import { type ChatStep } from '@/features/chat/chat-context'
import { StepTimeline } from './step-timeline'

export function StepSummary({ steps, usage }: { steps: ChatStep[]; usage?: ChatUsage }) {
	const [open, setOpen] = useState(false)
	const first = steps[0]
	const last = steps[steps.length - 1]
	const totalMs = (last.endedAt ?? last.startedAt) - first.startedAt

	return (
		<div className="flex flex-col gap-1">
			<button
				type="button"
				onClick={() => setOpen(!open)}
				aria-expanded={open}
				className="flex items-center gap-1 self-start text-[11px] text-faint transition-colors hover:text-subtle"
			>
				{open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
				{steps.length} langkah · {(Math.max(0, totalMs) / 1000).toFixed(1).replace('.', ',')} dtk
			</button>
			{open && <StepTimeline steps={steps} />}
			{usage && (usage.promptTokens !== undefined || usage.completionTokens !== undefined) && (
				<p className="text-[10px] text-faint">
					{(usage.promptTokens ?? 0).toLocaleString('id-ID')} token masuk ·{' '}
					{(usage.completionTokens ?? 0).toLocaleString('id-ID')} keluar
				</p>
			)}
		</div>
	)
}
