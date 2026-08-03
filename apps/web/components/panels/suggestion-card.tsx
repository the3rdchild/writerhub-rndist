'use client'

import type { SuggestionCategory } from '@writer-hub/shared'
import { CheckCircle2, Trash2 } from 'lucide-react'
import type { EditorSuggestion } from '@/features/document/suggestions'
import { useRangeHighlight } from '@/features/document/use-range-highlight'

export const CATEGORY_TEXT_COLOR: Record<SuggestionCategory, string> = {
	grammar: 'text-red-400',
	spelling: 'text-orange-400',
	style: 'text-yellow-300',
}

export function SuggestionCard({
	suggestion,
	onAccept,
	onDismiss,
}: {
	suggestion: EditorSuggestion
	onAccept: () => void
	onDismiss: () => void
}) {
	const { rangeProps, clearHover } = useRangeHighlight()

	const range =
		suggestion.offset === undefined
			? null
			: { offset: suggestion.offset, length: suggestion.length ?? suggestion.original.length }

	return (
		<div
			{...(range ? rangeProps(range) : {})}
			className="flex cursor-pointer flex-col gap-2 rounded-xl border border-line bg-[var(--overlay-hover)] p-3 transition-colors hover:border-line-strong"
		>
			<p className={`text-xs font-semibold ${CATEGORY_TEXT_COLOR[suggestion.category]}`}>
				{suggestion.type}
			</p>

			<div className="flex items-center justify-between gap-2">
				<div className="flex min-w-0 items-center gap-2 text-sm">
					<span className="truncate text-subtle line-through">{suggestion.original}</span>
					<span className="shrink-0 text-faint">→</span>
					<span className="truncate text-foreground">{suggestion.replacement}</span>
				</div>

				<div className="flex shrink-0 items-center gap-0.5">
					<button
						type="button"
						aria-label="Terima saran"
						onClick={(event) => {
							event.stopPropagation()
							clearHover()
							onAccept()
						}}
						className="rounded p-1 text-faint transition-colors hover:text-green-400"
					>
						<CheckCircle2 className="h-4 w-4" />
					</button>
					<button
						type="button"
						aria-label="Tolak saran"
						onClick={(event) => {
							event.stopPropagation()
							clearHover()
							onDismiss()
						}}
						className="rounded p-1 text-faint transition-colors hover:text-red-400"
					>
						<Trash2 className="h-4 w-4" />
					</button>
				</div>
			</div>
		</div>
	)
}
