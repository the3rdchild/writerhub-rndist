'use client'

import type { AiDetectorResult } from '@writer-hub/shared'
import { Bot, CheckCircle2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { riskColor, ScoreRing } from '@/components/ui/score-ring'
import { useAnalysis } from '@/features/analysis/use-analysis'
import { replaceTextRange } from '@/features/editor/apply-text'
import { useEditorInstance } from '@/features/editor/editor-context'
import { useSelectionScope } from '@/features/editor/selection'
import { useDocument } from '@/features/document/document-context'
import { useRangeHighlight } from '@/features/document/use-range-highlight'
import {
	AcceptAllButton,
	AcceptDismissRow,
	PanelEmptyState,
	PanelError,
	PanelFooter,
	PanelLoading,
	PanelScroll,
	RunButton,
	SelectionScopeChip,
	StaleNotice,
} from './panel-parts'

type Sentence = AiDetectorResult['sentences'][number]

interface SentenceState extends Sentence {
	applied?: boolean
	dismissed?: boolean
}

/** Menerima saran menurunkan skor kalimat, bukan menghilangkannya. */
const acceptedScore = (score: number) => Math.max(5, Math.round(score * 0.25))

export function AiDetectorPanel() {
	const { result, isRunning, error, isStale, canRun, run } = useAnalysis('ai_detector')
	const { dispatch } = useDocument()
	const { editor } = useEditorInstance()
	const { rangeProps } = useRangeHighlight()
	const scope = useSelectionScope()

	const [sentences, setSentences] = useState<SentenceState[]>([])

	useEffect(() => {
		setSentences(result ? [...result.sentences] : [])
	}, [result])

	const accept = (index: number) => {
		const sentence = sentences[index]
		const suggestion = sentence?.suggestion
		if (!suggestion) return

		// Terapkan langsung ke editor supaya format (cetak tebal, tabel, dst.)
		// tetap utuh; state.text disinkronkan otomatis lewat onUpdate editor.
		if (editor) {
			replaceTextRange(
				editor,
				{ offset: sentence.offset, length: sentence.length, expected: sentence.text },
				suggestion,
			)
		}

		const delta = suggestion.length - sentence.length
		setSentences((current) =>
			current.map((item, i) => {
				if (i === index) {
					return {
						...item,
						text: suggestion,
						length: suggestion.length,
						score: acceptedScore(item.score),
						suggestion: null,
						applied: true,
					}
				}
				return item.offset > sentence.offset ? { ...item, offset: item.offset + delta } : item
			}),
		)
	}

	const acceptAll = () => {
		// Dari offset terbesar ke terkecil, jadi satu penggantian tidak menggeser
		// posisi rentang yang belum diproses di dalam dokumen editor.
		const ordered = [...sentences]
			.filter((sentence) => sentence.suggestion && !sentence.dismissed && !sentence.applied)
			.sort((a, b) => b.offset - a.offset)

		if (editor) {
			for (const sentence of ordered) {
				const suggestion = sentence.suggestion as string
				replaceTextRange(
					editor,
					{ offset: sentence.offset, length: sentence.length, expected: sentence.text },
					suggestion,
				)
			}
		}

		setSentences((current) =>
			current.map((item) =>
				item.suggestion && !item.dismissed && !item.applied
					? {
							...item,
							text: item.suggestion,
							length: item.suggestion.length,
							score: acceptedScore(item.score),
							suggestion: null,
							applied: true,
						}
					: item,
			),
		)
	}

	const dismiss = (index: number) => {
		setSentences((current) =>
			current.map((item, i) => (i === index ? { ...item, dismissed: true } : item)),
		)
	}

	// Skor keseluruhan mengikuti kalimat yang sudah diperbaiki, bukan angka awal.
	const overallScore =
		sentences.length > 0
			? Math.round(sentences.reduce((sum, s) => sum + s.score, 0) / sentences.length)
			: (result?.overall_score ?? 0)

	const hasPending = sentences.some((s) => s.suggestion && !s.dismissed && !s.applied)

	return (
		<>
			<PanelScroll>
				{isStale && <StaleNotice />}
				{scope && !result && <SelectionScopeChip wordCount={scope.wordCount} />}
				{isRunning && <PanelLoading label="Analyzing..." />}
				{error && !isRunning && <PanelError message={error.message} />}

				{!isRunning && !error && result && (
					<div className="flex flex-col gap-2">
						{sentences.map((sentence, index) => (
							<div
								key={`${sentence.offset}-${sentence.text.slice(0, 24)}`}
								{...rangeProps({ offset: sentence.offset, length: sentence.length })}
								className="cursor-pointer rounded-xl border border-line bg-surface-raised p-3 transition-colors hover:border-line-strong"
							>
								<p className="text-xs leading-relaxed text-foreground">{sentence.text}</p>

								<div className="mt-2 flex items-center gap-2">
									<div className="h-1 flex-1 overflow-hidden rounded-full bg-line-strong">
										<div
											className="h-full rounded-full transition-all duration-500"
											style={{
												width: `${sentence.score}%`,
												backgroundColor: riskColor(sentence.score),
											}}
										/>
									</div>
									<span className="w-8 text-right text-[10px] text-subtle">{sentence.score}%</span>
								</div>

								{sentence.applied && (
									<p className="mt-2 flex items-center gap-1 text-[11px] text-emerald-400">
										<CheckCircle2 className="h-3.5 w-3.5" />
										Applied
									</p>
								)}

								{sentence.suggestion && !sentence.dismissed && (
									<div className="mt-2 flex flex-col gap-2 rounded-lg border border-accent/20 bg-accent/10 px-2.5 py-2">
										<div>
											<p className="mb-1 text-[10px] font-medium text-accent/70">Suggested revision</p>
											<p className="text-xs leading-relaxed text-foreground">{sentence.suggestion}</p>
										</div>
										<AcceptDismissRow
											onAccept={() => accept(index)}
											onDismiss={() => dismiss(index)}
											acceptDisabled={isStale}
										/>
									</div>
								)}
							</div>
						))}
					</div>
				)}

				{!isRunning && !error && !result && (
					<PanelEmptyState
						icon={Bot}
						title="Detect AI-written text"
						description="See how likely each sentence was written by AI"
					/>
				)}
			</PanelScroll>

			<PanelFooter>
				{result && hasPending && <AcceptAllButton onClick={acceptAll} disabled={isStale} />}

				{result && (
					<div className="flex items-center gap-3">
						<ScoreRing
							value={overallScore}
							suffix="%"
							size={56}
							strokeWidth={6}
							color={riskColor(overallScore)}
						/>
						<div className="flex flex-1 flex-col">
							<span className="text-sm font-medium" style={{ color: riskColor(overallScore) }}>
								{result.label}
							</span>
							<span className="text-[11px] text-subtle">AI-written probability</span>
						</div>
					</div>
				)}

				<RunButton
					onClick={() => run(scope ?? undefined)}
					disabled={!canRun}
					isRunning={isRunning}
					runningLabel="Analyzing..."
					label={result ? 'Run Again' : 'Run Detection'}
				/>
			</PanelFooter>
		</>
	)
}
