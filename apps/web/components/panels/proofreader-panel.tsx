'use client'

import { Check, Copy } from 'lucide-react'
import { useState } from 'react'
import { ScoreRing } from '@/components/ui/score-ring'
import { useDocument } from '@/features/document/document-context'
import type { SuggestionFilter } from '@/features/document/document-reducer'
import { useGrammarCheck } from '@/features/grammar/use-grammar-check'
import { useSelectionScope } from '@/features/editor/selection'
import { cn } from '@/lib/utils'
import { ModelSelector } from './model-selector'
import { AcceptAllButton, PanelError, PanelFooter, RunButton, SelectionScopeChip } from './panel-parts'
import { SuggestionCard } from './suggestion-card'

const FILTERS: Array<{ key: SuggestionFilter; label: string }> = [
	{ key: 'all', label: 'All' },
	{ key: 'grammar', label: 'Grammar' },
	{ key: 'style', label: 'Style' },
	{ key: 'spelling', label: 'Spelling' },
]

function qualityBadge(average: number): { text: string; className: string; bar: string } {
	if (average >= 75) {
		return { text: 'Excellent', className: 'bg-green-400/10 text-green-400', bar: 'bg-green-500' }
	}
	if (average >= 60) {
		return { text: 'Average', className: 'bg-yellow-400/10 text-yellow-400', bar: 'bg-yellow-500' }
	}
	return { text: 'Needs Work', className: 'bg-red-400/10 text-red-400', bar: 'bg-red-500' }
}

export function ProofreaderPanel() {
	const { state, dispatch, correctedText } = useDocument()
	const { runCheck, isRunning, error, canRun } = useGrammarCheck()
	const scope = useSelectionScope()
	const [copied, setCopied] = useState(false)

	const visible = state.suggestions.filter(
		(suggestion) =>
			!suggestion.dismissed && (state.filter === 'all' || suggestion.category === state.filter),
	)
	const hasResults = state.suggestions.length > 0 || state.scores !== null

	const average = state.scores
		? Math.round(
				(state.scores.grammar + state.scores.fluency + state.scores.clarity + state.scores.engagement) / 4,
			)
		: 0
	const quality = qualityBadge(average)

	const copyOutput = async () => {
		try {
			await navigator.clipboard.writeText(correctedText)
			setCopied(true)
			setTimeout(() => setCopied(false), 2000)
		} catch {
			// clipboard ditolak browser — abaikan, tombol tetap seperti semula
		}
	}

	return (
		<>
			<div className="flex shrink-0 gap-0.5 border-b border-line px-4 pt-3">
				{FILTERS.map(({ key, label }) => (
					<button
						key={key}
						type="button"
						onClick={() => dispatch({ type: 'setFilter', filter: key })}
						className={cn(
							'border-b-2 px-2.5 pb-2 text-sm transition-colors',
							state.filter === key
								? 'border-accent font-medium text-foreground'
								: 'border-transparent text-subtle hover:text-muted',
						)}
					>
						{label}
					</button>
				))}
			</div>

			<div className="min-h-0 flex-1 overflow-y-auto bg-surface-inset">
				{scope && !hasResults && (
					<div className="p-3">
						<SelectionScopeChip wordCount={scope.wordCount} />
					</div>
				)}
				{!hasResults && !isRunning ? (
					<div className="flex h-full flex-col items-center justify-center px-6 text-center">
						<p className="text-sm font-medium text-foreground">Nothing checked yet</p>
						<p className="mt-1 text-xs text-subtle">Start by writing or uploading a document</p>
					</div>
				) : (
					<div className="flex flex-col gap-2 p-3">
						{isRunning && state.suggestions.length === 0 && (
							<p className="py-10 text-center text-sm text-subtle">Analyzing text...</p>
						)}

						{visible.length > 0 && (
							<p className="mb-1 px-1 text-sm text-muted">
								<span className="font-semibold text-accent">{visible.length}</span>{' '}
								{visible.length === 1 ? 'suggestion' : 'suggestions'}
							</p>
						)}

						{visible.map((suggestion, index) => (
							<div
								key={suggestion.id}
								className="animate-in fade-in slide-in-from-right-2 duration-200"
								style={{ animationDelay: `${index * 30}ms`, animationFillMode: 'both' }}
							>
								<SuggestionCard
									suggestion={suggestion}
									onAccept={() => dispatch({ type: 'acceptSuggestion', id: suggestion.id })}
									onDismiss={() => dispatch({ type: 'dismissSuggestion', id: suggestion.id })}
								/>
							</div>
						))}

						{hasResults && !isRunning && visible.length === 0 && (
							<div className="py-10 text-center text-xs text-subtle">All suggestions resolved ✓</div>
						)}
					</div>
				)}
			</div>

			<PanelFooter>
				{error && <PanelError message={error.message} />}

				{visible.length > 0 && (
					<AcceptAllButton onClick={() => dispatch({ type: 'acceptAllSuggestions' })} />
				)}

				{hasResults && (
					<button
						type="button"
						onClick={copyOutput}
						className={cn(
							'flex w-full items-center justify-center gap-2 rounded-xl border px-4 py-2 text-sm font-medium transition-colors',
							copied
								? 'border-green-500/30 bg-green-500/15 text-green-400'
								: 'border-accent/30 bg-accent/10 text-accent hover:bg-accent/20',
						)}
					>
						{copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
						{copied ? 'Copied!' : 'Copy Result'}
					</button>
				)}

				{state.scores && (
					<>
						<div className="flex items-center justify-around pt-1">
							{Object.entries(state.scores).map(([key, value]) => (
								<ScoreRing key={key} label={key} value={value} />
							))}
						</div>

						<div className="flex items-center justify-between">
							<span className="text-[13px] text-muted">Writing quality</span>
							<span
								className={cn('rounded-full px-2 py-0.5 text-[10px] font-semibold', quality.className)}
							>
								{quality.text}
							</span>
						</div>
						<div className="h-1.5 overflow-hidden rounded-full bg-line-strong">
							<div
								className={cn('h-full rounded-full transition-all duration-500', quality.bar)}
								style={{ width: `${average}%` }}
							/>
						</div>
					</>
				)}

				<div className="mt-2 flex items-center gap-2">
					<ModelSelector
						value={state.model}
						disabled={isRunning}
						onChange={(model) => dispatch({ type: 'setModel', model })}
					/>
					<div className="shrink-0">
						<RunButton
							onClick={() => runCheck(scope ?? undefined)}
							disabled={!canRun}
							isRunning={isRunning}
							runningLabel="Checking..."
							label={hasResults ? 'Check Again' : 'Check Grammar'}
						/>
					</div>
				</div>
			</PanelFooter>
		</>
	)
}
