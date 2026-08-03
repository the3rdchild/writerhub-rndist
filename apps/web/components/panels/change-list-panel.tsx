'use client'

import type { AnalysisFeature, TextChange } from '@writer-hub/shared'
import type { LucideIcon } from 'lucide-react'
import { useAnalysis } from '@/features/analysis/use-analysis'
import { usePendingChanges } from '@/features/analysis/use-pending-changes'
import { useRangeHighlight } from '@/features/document/use-range-highlight'
import {
	AcceptAllButton,
	ChangeCard,
	PanelEmptyState,
	PanelError,
	PanelFooter,
	PanelLoading,
	PanelScroll,
	RunButton,
	StaleNotice,
} from './panel-parts'

export interface ChangeListPanelProps {
	feature: Extract<AnalysisFeature, 'ai_rewriter' | 'humanizer'>
	icon: LucideIcon
	emptyTitle: string
	emptyDescription: string
	runLabel: string
	rerunLabel: string
	runningLabel: string
	/** Pesan saat analisis selesai tapi tidak ada yang perlu diubah. */
	noChangesLabel: (result: unknown) => string
}

/**
 * AI Rewriter dan Humanizer punya alur yang persis sama — daftar diff yang
 * bisa di-accept per segmen — dan hanya berbeda pada teks serta ikon. Keduanya
 * memakai komponen ini alih-alih menyalin ~180 baris markup yang sama.
 */
export function ChangeListPanel({
	feature,
	icon,
	emptyTitle,
	emptyDescription,
	runLabel,
	rerunLabel,
	runningLabel,
	noChangesLabel,
}: ChangeListPanelProps) {
	const { result, isRunning, error, isStale, canRun, run } = useAnalysis(feature)
	const changes = (result as { changes?: TextChange[] } | undefined)?.changes
	const { pending, accept, dismiss, acceptAll } = usePendingChanges(changes)
	const { rangeProps } = useRangeHighlight()

	return (
		<>
			<PanelScroll>
				{isStale && <StaleNotice />}

				{isRunning && <PanelLoading label={runningLabel} />}
				{error && !isRunning && <PanelError message={error.message} />}

				{!isRunning && !error && result && (
					<>
						{pending.length > 0 ? (
							<div className="flex flex-col gap-2">
								<p className="px-1 text-[11px] text-subtle">
									{pending.length} {pending.length === 1 ? 'change' : 'changes'}
								</p>
								{pending.map((change, index) => (
									<ChangeCard
										key={`${change.offset}-${change.original}`}
										original={change.original}
										replacement={change.replacement}
										acceptDisabled={isStale}
										onAccept={() => accept(index)}
										onDismiss={() => dismiss(index)}
										{...rangeProps({ offset: change.offset, length: change.length })}
									/>
								))}
							</div>
						) : (
							<p className="py-4 text-center text-xs text-subtle">{noChangesLabel(result)}</p>
						)}
					</>
				)}

				{!isRunning && !error && !result && (
					<PanelEmptyState icon={icon} title={emptyTitle} description={emptyDescription} />
				)}
			</PanelScroll>

			<PanelFooter>
				{pending.length > 0 && <AcceptAllButton onClick={acceptAll} disabled={isStale} />}
				<RunButton
					onClick={run}
					disabled={!canRun}
					isRunning={isRunning}
					runningLabel={runningLabel}
					label={result ? rerunLabel : runLabel}
				/>
			</PanelFooter>
		</>
	)
}
