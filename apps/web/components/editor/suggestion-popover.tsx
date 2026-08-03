'use client'

import { CheckCircle2, X } from 'lucide-react'
import type { EditorSuggestion } from '@/features/document/suggestions'
import { CATEGORY_TEXT_COLOR } from '@/components/panels/suggestion-card'

export interface PopoverPosition {
	id: string
	top: number
	left: number
}

/** Kartu kecil yang muncul saat penanda suggestion di editor di-hover. */
export function SuggestionPopover({
	suggestion,
	position,
	onAccept,
	onDismiss,
	onMouseEnter,
	onMouseLeave,
}: {
	suggestion: EditorSuggestion
	position: PopoverPosition
	onAccept: () => void
	onDismiss: () => void
	onMouseEnter: () => void
	onMouseLeave: () => void
}) {
	return (
		<div
			className="absolute z-30 flex w-52 flex-col gap-2 rounded-xl border border-line-strong bg-surface-raised p-3 shadow-xl"
			style={{ top: position.top, left: position.left }}
			onClick={(event) => event.stopPropagation()}
			onMouseEnter={onMouseEnter}
			onMouseLeave={onMouseLeave}
		>
			<p className={`text-xs font-semibold ${CATEGORY_TEXT_COLOR[suggestion.category]}`}>
				{suggestion.type}
			</p>

			<div className="flex items-center gap-1.5 text-xs">
				<span className="truncate text-subtle line-through">{suggestion.original}</span>
				<span className="shrink-0 text-faint">→</span>
				<span className="truncate font-medium text-foreground">{suggestion.replacement}</span>
			</div>

			<div className="flex gap-1.5 pt-0.5">
				<button
					type="button"
					onClick={onAccept}
					className="flex flex-1 items-center justify-center gap-1 rounded-lg bg-green-500/15 py-1.5 text-xs text-green-400 transition-colors hover:bg-green-500/25"
				>
					<CheckCircle2 className="h-3.5 w-3.5" />
					Accept
				</button>
				<button
					type="button"
					onClick={onDismiss}
					className="flex flex-1 items-center justify-center gap-1 rounded-lg bg-line-strong py-1.5 text-xs text-muted transition-colors hover:bg-line-strong/70"
				>
					<X className="h-3.5 w-3.5" />
					Dismiss
				</button>
			</div>
		</div>
	)
}
