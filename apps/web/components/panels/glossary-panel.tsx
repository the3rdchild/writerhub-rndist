'use client'

import type { GlossaryResult } from '@writer-hub/shared'
import { BookMarked } from 'lucide-react'
import { useAnalysis } from '@/features/analysis/use-analysis'
import {
	buildGlossarySection,
	findGlossarySection,
	glossaryTermLabel,
} from '@/features/analysis/glossary-table'
import { useEditorInstance } from '@/features/editor/editor-context'
import {
	PanelEmptyState,
	PanelError,
	PanelFooter,
	PanelLoading,
	PanelScroll,
	RunButton,
} from './panel-parts'

/**
 * Glosarium: susun daftar istilah dari naskah, sisipkan sebagai tabel.
 *
 * Berbeda dari modul lain di rail, hasilnya bukan usulan per rentang teks
 * melainkan satu bagian utuh di akhir tab - jadi ia tidak memakai
 * `ChangeListPanel` maupun highlight layer.
 *
 * Sengaja selalu bekerja pada SELURUH tab, tanpa menghormati seleksi: daftar
 * istilah yang hanya mencakup satu paragraf yang kebetulan tersorot bukan
 * glosarium, dan kalau seleksi diam-diam mempersempitnya pengguna tidak punya
 * cara tahu.
 */
export function GlossaryPanel() {
	const { result, isRunning, error, canRun, run } = useAnalysis('glossary')
	const { editor } = useEditorInstance()

	const entries = (result as GlossaryResult | undefined)?.entries ?? []
	const llmUnavailable = (result as GlossaryResult | undefined)?.llm_unavailable

	/**
	 * Sisipkan bagian Glosarium di akhir tab, atau ganti yang sudah ada.
	 *
	 * Menjalankan ulang tidak boleh meninggalkan dua tabel; yang diganti hanya
	 * heading "Glosarium" yang diikuti tabel - lihat `findGlossarySection`.
	 */
	const insert = () => {
		if (!editor || editor.isDestroyed || entries.length === 0) return

		const section = buildGlossarySection(entries)
		const existing = findGlossarySection(editor.state.doc)

		if (existing) {
			editor.chain().focus().insertContentAt(existing, section).run()
			return
		}
		editor.chain().focus().insertContentAt(editor.state.doc.content.size, section).run()
	}

	return (
		<>
			<PanelScroll>
				{isRunning && <PanelLoading label="Menyusun daftar istilah…" />}
				{error && !isRunning && <PanelError message={error.message} />}

				{!isRunning && !error && result && (
					<>
						{llmUnavailable ? (
							<PanelError message="AI tidak dapat dihubungi, jadi daftar istilah tidak bisa disusun. Periksa konfigurasi penyedia AI, lalu coba lagi." />
						) : entries.length === 0 ? (
							<p className="py-4 text-center text-xs text-subtle">
								No terms were found. The glossary is built from words and acronyms that
									<strong>repeat</strong> in the text, so terms that appear only once are
									not captured (except acronyms, which are kept even on a single mention).
							</p>
						) : (
							<div className="flex flex-col gap-2">
								<p className="px-1 text-[11px] leading-relaxed text-subtle">
									Built from words and acronyms that <strong>repeat</strong> in this text —
									terms that appear only once are not captured, except acronyms.
								</p>
								<p className="mb-1 px-1 text-[11px] text-subtle">
									{entries.length} terms found
								</p>
								{entries.map((entry) => (
									<div
										key={entry.term}
										className="flex flex-col gap-1 rounded-xl border border-line bg-surface-raised p-3"
									>
										<div className="flex items-baseline justify-between gap-2">
											<span className="text-xs font-medium text-foreground">
													{glossaryTermLabel(entry)}
												</span>
											<span className="flex shrink-0 items-center gap-1.5 text-faint">
												{entry.source === 'acronym' ? (
												<span className="rounded-full bg-accent/10 px-1.5 py-0.5 text-[9px] font-medium text-accent">Acronym</span>
											) : entry.source === 'phrase' ? (
												<span className="rounded-full bg-surface-inset px-1.5 py-0.5 text-[9px] font-medium text-muted">Repeated phrase</span>
											) : null}
											<span title={`Appears ${entry.occurrences}× in the text`} className="text-[10px]">{entry.occurrences}×</span>
											</span>
										</div>
										<p className="text-xs leading-relaxed text-muted">{entry.definition}</p>
									</div>
								))}
							</div>
						)}
					</>
				)}

				{!isRunning && !error && !result && (
					<PanelEmptyState
						icon={BookMarked}
						title="Buat daftar istilah"
						description="AI memindai seluruh tab ini, mengumpulkan istilah dan akronim yang berulang, lalu menyusun definisinya sebagai tabel di akhir naskah."
					/>
				)}
			</PanelScroll>

			<PanelFooter>
				{entries.length > 0 && (
					<button
						type="button"
						onClick={insert}
						className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-green-500/15 py-2 text-xs text-green-400 transition-colors hover:bg-green-500/25"
					>
						<BookMarked className="h-3.5 w-3.5" />
						Sisipkan tabel Glosarium
					</button>
				)}

				<RunButton
					onClick={() => run()}
					disabled={!canRun}
					isRunning={isRunning}
					runningLabel="Memindai…"
					label={result ? 'Pindai ulang' : 'Buat glosarium'}
				/>
			</PanelFooter>
		</>
	)
}
