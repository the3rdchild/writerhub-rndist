'use client'

import type { AnalysisFeature, RewriterTone, TextChange } from '@writer-hub/shared'
import { REWRITE_TONES } from '@writer-hub/shared'
import type { LucideIcon } from 'lucide-react'
import { useAnalysis } from '@/features/analysis/use-analysis'
import { usePendingChanges } from '@/features/analysis/use-pending-changes'
import { useRangeHighlight } from '@/features/document/use-range-highlight'
import { useSelectionScope } from '@/features/editor/selection'
import { ToolbarSelect } from '@/components/ui/toolbar-select'
import { usePersistentState } from '@/lib/use-persistent-state'
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
import { RunScopeBar } from './run-scope-bar'

/** Nilai tone 'default' = tanpa arahan khusus (AI Memory tetap berlaku). */
type ToneChoice = RewriterTone | 'default'

const TONE_OPTIONS: ReadonlyArray<{ value: ToneChoice; label: string }> = [
	{ value: 'default', label: 'Default' },
	...REWRITE_TONES.map((tone) => ({ value: tone.id as ToneChoice, label: tone.label })),
]

export interface ChangeListPanelProps {
	feature: Extract<AnalysisFeature, 'ai_rewriter' | 'humanizer'>
	icon: LucideIcon
	emptyTitle: string
	emptyDescription: string
	runLabel: string
	rerunLabel: string
	/** Label saat Run akan bekerja pada seleksi, bukan seluruh naskah. */
	scopedLabel: string
	runningLabel: string
	/** Pesan saat analisis selesai tapi tidak ada yang perlu diubah. */
	noChangesLabel: (result: unknown) => string
}

/**
 * AI Rewriter dan Humanizer punya alur yang persis sama - daftar diff yang
 * bisa di-accept per segmen - dan hanya berbeda pada teks serta ikon. Keduanya
 * memakai komponen ini alih-alih menyalin ~180 baris markup yang sama.
 */
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
	const { result, isRunning, error, isStale, canRun, run } = useAnalysis(feature)
	const changes = (result as { changes?: TextChange[] } | undefined)?.changes
	const { pending, accept, dismiss, acceptAll } = usePendingChanges(changes)
	const { rangeProps } = useRangeHighlight()
	const scope = useSelectionScope()

	// Pemilih tone hanya untuk AI Rewriter; pilihan terakhir diingat per browser.
	const [tone, setTone] = usePersistentState<ToneChoice>('writer-hub-rewriter-tone', 'default')
	const selectedTone = tone === 'default' ? undefined : tone

	// Mengganti tone langsung menjalankan ulang (bila sudah ada hasil) supaya
	// perbedaannya terlihat tanpa harus menekan Rewrite Again dulu.
	const handleToneChange = (value: ToneChoice) => {
		setTone(value)
		if (result && !isRunning) {
			run(scope ?? undefined, value === 'default' ? undefined : value)
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
						) : (changes ?? []).length === 0 ? (
							// Hasil tanpa satu pun usulan (mis. LLM tidak tersedia
							// dan fallback mengembalikan teks apa adanya) bukan
							// "semua perubahan diterapkan" - jangan tampilkan
							// pesan yang menyerupai sukses.
							<p className="py-4 text-center text-xs text-subtle">
								Tidak ada perubahan yang disarankan untuk teks ini
							</p>
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

				{feature === 'ai_rewriter' && (
					<div className="flex items-center gap-1.5 px-1">
						<span className="text-[11px] text-subtle">Tone</span>
						<ToolbarSelect
							value={tone}
							options={TONE_OPTIONS}
							onChange={handleToneChange}
							label="Tone hasil rewrite"
							width={110}
							disabled={isRunning}
							side="top"
						/>
					</div>
				)}

				<RunScopeBar wordCount={scope?.wordCount ?? null} />

				<RunButton
					onClick={() => run(scope ?? undefined, selectedTone)}
					disabled={!canRun}
					isRunning={isRunning}
					runningLabel={runningLabel}
					label={scope ? scopedLabel : result ? rerunLabel : runLabel}
				/>
			</PanelFooter>
		</>
	)
}
