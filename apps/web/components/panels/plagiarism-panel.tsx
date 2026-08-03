'use client'

import { Search, TriangleAlert } from 'lucide-react'
import { useAnalysis } from '@/features/analysis/use-analysis'
import { useRangeHighlight } from '@/features/document/use-range-highlight'
import { cn } from '@/lib/utils'
import {
	PanelEmptyState,
	PanelError,
	PanelFooter,
	PanelLoading,
	PanelScroll,
	RunButton,
	StaleNotice,
} from './panel-parts'

/** Uniqueness tinggi berarti bagus, jadi skalanya kebalikan dari skor risiko. */
function uniquenessColor(score: number): string {
	if (score > 85) return 'text-green-400'
	if (score > 70) return 'text-yellow-400'
	if (score > 50) return 'text-orange-400'
	return 'text-red-400'
}

export function PlagiarismPanel() {
	const { result, isRunning, error, isStale, canRun, run } = useAnalysis('plagiarism')
	const { rangeProps } = useRangeHighlight()

	return (
		<>
			<PanelScroll>
				{isStale && <StaleNotice />}
				{isRunning && <PanelLoading label="Checking..." />}
				{error && !isRunning && <PanelError message={error.message} />}

				{!isRunning && !error && result && (
					<>
						<div className="flex flex-col items-center gap-1 py-2">
							<span className={cn('text-3xl font-bold', uniquenessColor(result.uniqueness_score))}>
								{result.uniqueness_score}%
							</span>
							<span className={cn('text-sm font-medium', uniquenessColor(result.uniqueness_score))}>
								{result.label}
							</span>
							<span className="text-[11px] text-subtle">Uniqueness score</span>
						</div>

						{result.flagged_phrases.length > 0 ? (
							<div className="flex flex-col gap-2">
								<p className="text-[11px] text-subtle">
									{result.flagged_phrases.length}{' '}
									{result.flagged_phrases.length === 1 ? 'flagged phrase' : 'flagged phrases'}
								</p>
								{result.flagged_phrases.map((phrase) => (
									<div
										key={`${phrase.offset}-${phrase.text.slice(0, 24)}`}
										{...rangeProps({ offset: phrase.offset, length: phrase.length })}
										className="cursor-pointer rounded-xl border border-line bg-surface-raised p-3 transition-colors hover:border-line-strong"
									>
										<p className="text-xs leading-relaxed text-foreground">&ldquo;{phrase.text}&rdquo;</p>
										<p className="mt-1.5 text-[10px] text-orange-400/80">
											{Math.round(phrase.similarity * 100)}% similar to commonly used phrasing
										</p>
									</div>
								))}
							</div>
						) : (
							<p className="py-2 text-center text-xs text-subtle">
								No common phrasing detected ✓
							</p>
						)}

						<p className="flex items-start gap-1.5 rounded-xl bg-[var(--overlay-hover)] px-3 py-2 text-[10px] text-subtle">
							<TriangleAlert className="mt-0.5 h-3 w-3 shrink-0" />
							Heuristic check — not a replacement for a full plagiarism service
						</p>
					</>
				)}

				{!isRunning && !error && !result && (
					<PanelEmptyState
						icon={Search}
						title="Check text uniqueness"
						description="Flags phrasing that closely matches common content on the web"
					/>
				)}
			</PanelScroll>

			<PanelFooter>
				<RunButton
					onClick={run}
					disabled={!canRun}
					isRunning={isRunning}
					runningLabel="Checking..."
					label={result ? 'Check Again' : 'Check Plagiarism'}
				/>
			</PanelFooter>
		</>
	)
}
