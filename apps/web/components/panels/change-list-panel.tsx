'use client'

import type { AnalysisFeature, RewriterTone, TextChange } from '@writer-hub/shared'
import { REWRITE_TONES } from '@writer-hub/shared'
import type { LucideIcon } from 'lucide-react'
import { useMemo } from 'react'
import { useAnalysis } from '@/features/analysis/use-analysis'
import { useAnalysisHighlight } from '@/features/analysis/use-analysis-highlight'
import { useCandidatePreview } from '@/features/analysis/use-candidate-preview'
import { usePendingChanges } from '@/features/analysis/use-pending-changes'
import { usePreTranslateSnapshot } from '@/features/analysis/use-pre-translate-snapshot'
import { useRangeHighlight } from '@/features/document/use-range-highlight'
import { LANGUAGE_OPTIONS } from '@/features/document/language'
import { useSelectionScope } from '@/features/editor/selection'
import { Flag } from '@/components/ui/flag'
import { ToolbarSelect } from '@/components/ui/toolbar-select'
import { usePersistentState } from '@/lib/use-persistent-state'
import {
	AcceptAllButton,
	AppliedCard,
	CandidateCard,
	ChangeCard,
	ClearResultsButton,
	CompareButton,
	PanelEmptyState,
	PanelError,
	PanelFooter,
	PanelLoading,
	PanelScroll,
	RunButton,
	StaleNotice,
} from './panel-parts'
import { RunScopeBar } from './run-scope-bar'
import { editsFromChanges, useAnalysisDiff } from '@/features/analysis/use-analysis-diff'
type ToneChoice = RewriterTone | 'default'

const TONE_OPTIONS: ReadonlyArray<{ value: ToneChoice; label: string }> = [
	{ value: 'default', label: 'Default' },
	...REWRITE_TONES.map((tone) => ({ value: tone.id as ToneChoice, label: tone.label })),
]
const LANGUAGE_CHOICES = LANGUAGE_OPTIONS.map((entry) => ({
	value: entry.code,
	label: entry.label,
	icon: <Flag code={entry.flag} />,
}))

export interface ChangeListPanelProps {
	feature: Extract<AnalysisFeature, 'ai_rewriter' | 'humanizer' | 'translator'>
	icon: LucideIcon
	emptyTitle: string
	emptyDescription: string
	runLabel: string
	rerunLabel: string
	scopedLabel: string
	runningLabel: string
	noChangesLabel: (result: unknown) => string
}
export function ChangeListPanel({
	feature,
	icon,
	emptyTitle,
	emptyDescription,
	runLabel,
	rerunLabel,
	scopedLabel,
	runningLabel,
	noChangesLabel,
}: ChangeListPanelProps) {
	const scope = useSelectionScope()
	const { result, isRunning, error, isStale, canRun, run, cancel, clear } = useAnalysis(feature, scope)
	const changes = (result as { changes?: TextChange[] } | undefined)?.changes
	const llmUnavailable = (result as { llm_unavailable?: boolean } | undefined)?.llm_unavailable
	const { pending, applied, accept, dismiss, acceptAll, revert, canRevert } =
		usePendingChanges(changes)
	const { rangeProps } = useRangeHighlight()
	const { preview, showPreview, clearPreview } = useCandidatePreview()
	const { ensureSnapshot, reset: resetSnapshot } = usePreTranslateSnapshot()
	const diffEdits = useMemo(
		() => editsFromChanges(pending, applied),
		[pending, applied],
	)
	const compare = useAnalysisDiff(feature, diffEdits)
	const highlightRanges = useMemo(
		() => pending.map(({ offset, length }) => ({ offset, length, kind: 'change' as const })),
		[pending],
	)
	useAnalysisHighlight(feature, highlightRanges)
	const applyGuard = feature === 'translator' ? ensureSnapshot : undefined
	const [tone, setTone] = usePersistentState<ToneChoice>('writer-hub-rewriter-tone', 'default')
	const selectedTone = tone === 'default' ? undefined : tone
	const [targetLang, setTargetLang] = usePersistentState<string>(
		'writer-hub-translator-target',
		'en',
	)

	const runOptions =
		feature === 'translator' ? { targetLang } : feature === 'ai_rewriter' ? { tone: selectedTone } : {}
	const handleToneChange = (value: ToneChoice) => {
		setTone(value)
		if (result && !isRunning) {
			run(scope ?? undefined, { tone: value === 'default' ? undefined : value })
		}
	}
	const handleTargetLangChange = (value: string) => {
		setTargetLang(value)
		resetSnapshot()
		if (result && !isRunning) {
			run(scope ?? undefined, { targetLang: value })
		}
	}

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
								{pending.map((change, index) =>
									change.candidates && change.candidates.length > 1 ? (
										<CandidateCard
											key={`${change.offset}-${change.original}`}
											original={change.original}
											candidates={change.candidates}
											previewIndex={preview?.index === index ? preview.candidate : null}
											onPreview={(candidate) =>
												showPreview(index, candidate, change)
											}
											onClearPreview={clearPreview}
											onApply={(candidate) => {
												clearPreview()
												accept(index, change.candidates?.[candidate])
											}}
											onDismiss={() => dismiss(index)}
											{...rangeProps({ offset: change.offset, length: change.length })}
										/>
									) : (
										<ChangeCard
											key={`${change.offset}-${change.original}`}
											original={change.original}
											replacement={change.replacement}
											acceptDisabled={isStale}
											onAccept={() => {
													applyGuard?.()
													accept(index)
												}}
												onDismiss={() => dismiss(index)}
											{...rangeProps({ offset: change.offset, length: change.length })}
										/>
									),
								)}
							</div>
						) : llmUnavailable ? (
							<PanelError message="AI could not be reached, so no suggestions could be produced. Check the AI provider configuration, then try again." />
						) : (changes ?? []).length === 0 ? (
							<p className="py-4 text-center text-xs text-subtle">
								No changes suggested for this text
							</p>
						) : (
							<p className="py-4 text-center text-xs text-subtle">{noChangesLabel(result)}</p>
						)}

						{applied.length > 0 && (
							<div className="mt-3 flex flex-col gap-2 border-t border-line pt-3">
								<p className="text-[11px] font-medium uppercase tracking-wide text-subtle">
									Applied
								</p>
								{applied.map((entry) => (
									<AppliedCard
										key={entry.id}
										original={entry.original}
										applied={entry.applied}
										canRevert={canRevert(entry.id)}
										onRevert={() => revert(entry.id)}
									/>
								))}
							</div>
						)}
					</>
				)}

				{!isRunning && !error && !result && (
					<PanelEmptyState icon={icon} title={emptyTitle} description={emptyDescription} />
				)}
			</PanelScroll>

			<PanelFooter>
				{pending.length > 0 && (
						<AcceptAllButton
							onClick={() => {
								applyGuard?.()
								acceptAll()
							}}
							disabled={isStale}
						/>
					)}

			{/* Pratinjau diff "accept-all virtual" di editor utama (§diff hasil
			    dengan dokumen). Dimatikan saat basi: offset change sudah tidak
			    menempel pada teks yang berubah. */}
			{compare.hasEdits && (
				<CompareButton
					active={compare.isEnabled}
					disabled={isStale}
					onToggle={() => (compare.isEnabled ? compare.disable() : compare.enable())}
				/>
			)}


				{feature === 'ai_rewriter' && (
				<div className="flex items-center gap-1.5 px-1">
					<span className="text-[11px] text-subtle">Tone</span>
					<ToolbarSelect
						value={tone}
						options={TONE_OPTIONS}
						onChange={handleToneChange}
						label="Rewrite tone"
						width={110}
						disabled={isRunning}
						side="top"
					/>
				</div>
			)}

			{feature === 'translator' && (
					<div className="flex items-center gap-1.5 px-1">
						<span className="text-[11px] text-subtle">To</span>
						<ToolbarSelect
							value={targetLang}
							options={LANGUAGE_CHOICES}
							onChange={handleTargetLangChange}
							label="Translation target language"
							width={140}
							disabled={isRunning}
							side="top"
						/>
					</div>
				)}

				<RunScopeBar wordCount={scope?.wordCount ?? null} />

				{!isRunning && result && <ClearResultsButton onClick={clear} />}

				<RunButton
					onClick={() => run(scope ?? undefined, runOptions)}
					onCancel={cancel}
					disabled={!canRun}
					isRunning={isRunning}
					runningLabel={runningLabel}
					label={scope ? scopedLabel : result ? rerunLabel : runLabel}
				/>
			</PanelFooter>
		</>
	)
}
