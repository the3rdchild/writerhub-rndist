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

/** Bahasa tujuan Translator - memakai ulang daftar bahasa dokumen. */
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
	/** Label saat Run akan bekerja pada seleksi, bukan seluruh naskah. */
	scopedLabel: string
	runningLabel: string
	/** Pesan saat analisis selesai tapi tidak ada yang perlu diubah. */
	noChangesLabel: (result: unknown) => string
}

/**
 * AI Rewriter, Humanizer, dan Translator punya alur yang persis sama - daftar
 * usulan pengganti yang bisa diterima per segmen - dan hanya berbeda pada teks,
 * ikon, serta satu kendali di kaki panel (tone untuk Rewriter, bahasa tujuan
 * untuk Translator). Ketiganya memakai komponen ini alih-alih menyalin ~200
 * baris markup yang sama.
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
	const scope = useSelectionScope()
	const { result, isRunning, error, isStale, canRun, run, cancel, clear } = useAnalysis(feature, scope)
	const changes = (result as { changes?: TextChange[] } | undefined)?.changes
	const llmUnavailable = (result as { llm_unavailable?: boolean } | undefined)?.llm_unavailable
	const { pending, applied, accept, dismiss, acceptAll, revert, canRevert } =
		usePendingChanges(changes)
	const { rangeProps } = useRangeHighlight()
	const { preview, showPreview, clearPreview } = useCandidatePreview()
	const { ensureSnapshot, reset: resetSnapshot } = usePreTranslateSnapshot()

	/*
	 * Sorot segmen yang masih pending di naskah. Daftarnya dihitung ulang dari
	 * state pending - yang sudah menggeser offset sesudahnya tiap kali satu
	 * change diterima - jadi terima/tolak/batal otomatis memperbarui sorotan.
	 */
	const highlightRanges = useMemo(
		() => pending.map(({ offset, length }) => ({ offset, length, kind: 'change' as const })),
		[pending],
	)
	useAnalysisHighlight(feature, highlightRanges)

	/*
	 * Terjemahan menimpa banyak kalimat sekaligus, jadi penerapan pertamanya
	 * membuat versi `pre_translate` lebih dulu. Modul lain tidak: mereka
	 * mengganti satu kalimat per klik, dan undef editor sudah cukup.
	 */
	const applyGuard = feature === 'translator' ? ensureSnapshot : undefined

	// Pemilih tone hanya untuk AI Rewriter; pilihan terakhir diingat per browser.
	const [tone, setTone] = usePersistentState<ToneChoice>('writer-hub-rewriter-tone', 'default')
	const selectedTone = tone === 'default' ? undefined : tone

	// Bahasa tujuan Translator, juga diingat per browser. Bawaannya Inggris:
	// naskah di sini kebanyakan berbahasa Indonesia, jadi arah itu yang paling
	// sering dipakai - dan pilihannya toh langsung terlihat di kaki panel.
	const [targetLang, setTargetLang] = usePersistentState<string>(
		'writer-hub-translator-target',
		'en',
	)

	const runOptions =
		feature === 'translator' ? { targetLang } : feature === 'ai_rewriter' ? { tone: selectedTone } : {}

	// Mengganti tone langsung menjalankan ulang (bila sudah ada hasil) supaya
	// perbedaannya terlihat tanpa harus menekan Rewrite Again dulu.
	const handleToneChange = (value: ToneChoice) => {
		setTone(value)
		if (result && !isRunning) {
			run(scope ?? undefined, { tone: value === 'default' ? undefined : value })
		}
	}

	// Idem untuk bahasa tujuan: mengganti bahasa berarti minta terjemahan lain,
	// bukan sekadar mengubah label.
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
									// Dua kandidat atau lebih layak dipilih; satu kandidat
									// tidak - kartu pilihan untuk satu pilihan cuma menambah
									// klik tanpa menambah kuasa.
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
							// Gagal menjangkau AI dan "naskahmu memang sudah bagus"
							// sama-sama berupa changes kosong. Menyamakan keduanya
							// membuat kegagalan terbaca sebagai pujian - dan pengguna
							// mengklik Rewrite berulang kali tanpa tahu apa yang salah.
							<PanelError message="AI tidak dapat dihubungi, jadi tidak ada usulan yang bisa dibuat. Periksa konfigurasi penyedia AI, lalu coba lagi." />
						) : (changes ?? []).length === 0 ? (
							<p className="py-4 text-center text-xs text-subtle">
								Tidak ada perubahan yang disarankan untuk teks ini
							</p>
						) : (
							<p className="py-4 text-center text-xs text-subtle">{noChangesLabel(result)}</p>
						)}

						{applied.length > 0 && (
							<div className="mt-3 flex flex-col gap-2 border-t border-line pt-3">
								<p className="text-[11px] font-medium uppercase tracking-wide text-subtle">
									Sudah diterapkan
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

				{feature === 'translator' && (
					<div className="flex items-center gap-1.5 px-1">
						<span className="text-[11px] text-subtle">Ke</span>
						<ToolbarSelect
							value={targetLang}
							options={LANGUAGE_CHOICES}
							onChange={handleTargetLangChange}
							label="Bahasa tujuan terjemahan"
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
