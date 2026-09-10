'use client'

import type { ChatUsage } from '@writer-hub/shared'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { useState } from 'react'
import type { ChatStep } from '@/features/chat/chat-context'
import { StepTimeline } from './step-timeline'

/** Label fase datang dengan elipsisnya sendiri; dirangkai jadi satu baris ia jadi berisik. */
function trimLabel(label: string): string {
	return label.replace(/[.…]+$/, '')
}

/**
 * Berapa label yang muat sebelum barisnya jadi paragraf.
 *
 * Sisanya sengaja diringkas jadi elipsis, bukan dipendekkan lagi: seluruh
 * daftarnya toh muncul begitu kelompoknya diklik.
 */
const LABELS_SHOWN = 2

export function StepSummary({ steps, usage }: { steps: ChatStep[]; usage?: ChatUsage }) {
	const [open, setOpen] = useState(false)
	const first = steps[0]
	const last = steps[steps.length - 1]
	const totalMs = (last.endedAt ?? last.startedAt) - first.startedAt
	const shown = steps.slice(0, LABELS_SHOWN).map((step) => trimLabel(step.label))
	const hidden = steps.length - shown.length

	return (
		<div className="flex flex-col gap-1">
			<button
				type="button"
				onClick={() => setOpen(!open)}
				aria-expanded={open}
				className="flex w-full items-center gap-1.5 text-left text-[11px] text-faint transition-colors hover:text-subtle"
			>
				{open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
				<span className="min-w-0 truncate">
					{shown.join(' · ')}
					{hidden > 0 && ` · … ${steps.length} langkah`}
				</span>
				<span className="shrink-0">{(Math.max(0, totalMs) / 1000).toFixed(1).replace('.', ',')} dtk</span>
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
