'use client'

import { FileDown, Printer } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { PrintTabsView } from '@/components/export/print-tabs-view'
import { chosenTabs, type TabScope, TabScopePicker } from '@/components/export/tab-scope-picker'
import { prepareForExport } from '@/features/document/prepare-export'
import { useEditorInstance } from '@/features/editor/editor-context'
import { usePageFurniture } from '@/features/editor/page-furniture/use-page-furniture'
import { usePageSetup } from '@/features/editor/use-page-setup'
import { useTypography } from '@/features/editor/use-typography'
import type { ExportPayload } from '@/features/export/types'
import { sessionLabel, useSessions } from '@/features/sessions/session-context'
import { useSettings } from '@/features/settings/settings-context'
import { fragmentToJSON } from '@/features/sync/serialize'

export function ExportPdfDialog() {
	const { exportOpen, setExportOpen } = useSettings()
	const { editor } = useEditorInstance()
	const { doc, documents, activeDocId, activeId, sessions } = useSessions()
	const { setup } = usePageSetup()
	const { typography } = useTypography()
	const { furniture } = usePageFurniture()
	const [preparing, setPreparing] = useState(false)
	const [scope, setScope] = useState<TabScope>('current')
	const [picked, setPicked] = useState<Set<string>>(new Set())
	const [printPayload, setPrintPayload] = useState<ExportPayload | null>(null)
	const overlayRef = useRef<HTMLDivElement>(null)
	const clearPrint = useCallback(() => setPrintPayload(null), [])

	useEffect(
		function resetScopeOnOpen() {
			if (!exportOpen) return
			setScope('current')
			setPicked(new Set(activeId ? [activeId] : []))
		},
		[exportOpen, activeId],
	)

	useEffect(
		function lockScrollAndCloseOnEscape() {
			if (!exportOpen) return

			document.body.style.overflow = 'hidden'
			const onKeyDown = (event: KeyboardEvent) => {
				if (event.key === 'Escape') setExportOpen(false)
			}
			window.addEventListener('keydown', onKeyDown)

			return () => {
				document.body.style.overflow = ''
				window.removeEventListener('keydown', onKeyDown)
			}
		},
		[exportOpen, setExportOpen],
	)

	const printView = printPayload ? <PrintTabsView payload={printPayload} onDone={clearPrint} /> : null
	if (!exportOpen) return printView

	const tabs = sessions.map((tab) => ({ id: tab.id, title: sessionLabel(tab), emoji: tab.emoji }))
	const chosen = chosenTabs(tabs, activeId, scope, picked)
	const onlyActive = chosen.length === 1 && chosen[0].id === activeId

	/*
	 * Blok turunan disegarkan **sebelum** dialog cetak dibuka, dan ditunggu.
	 *
	 * `window.print()` memblokir utas begitu ia dipanggil, jadi render Mermaid
	 * atau potretan blok HTML yang baru dimulai tidak akan pernah sempat masuk ke
	 * berkas - kode diagram tercetak sebagai teks mentah. Jeda 100ms yang dulu
	 * ada di sini menunggu dialog ini menutup, bukan menunggu render selesai.
	 */
	const print = async () => {
		if (preparing || chosen.length === 0) return
		setPreparing(true)
		try {
			await prepareForExport(editor)
		} finally {
			setPreparing(false)
		}
		setExportOpen(false)
		if (onlyActive) {
			// Satu bingkai supaya dialog benar-benar lepas dari DOM sebelum dicetak.
			setTimeout(() => window.print(), 100)
			return
		}
		setPrintPayload({
			documentId: activeDocId ?? 'local',
			title: documents.find((dok) => dok.id === activeDocId)?.title ?? 'Untitled document',
			layout: { pageSetup: setup, typography, ...(furniture ? { furniture } : {}) },
			tabs: chosen.map((tab) => ({
				id: tab.id,
				title: tab.title,
				content: fragmentToJSON(doc, tab.id),
				layout: null,
			})),
		})
	}

	return (
		<>
			{printView}
			<div
				ref={overlayRef}
				role="dialog"
				aria-modal="true"
				aria-label="Export PDF"
				className="fixed inset-0 z-[70] flex animate-in items-center justify-center bg-black/60 backdrop-blur-sm fade-in duration-200"
				onClick={(event) => {
					if (event.target === overlayRef.current) setExportOpen(false)
				}}
			>
				<div className="flex w-full max-w-md animate-in flex-col gap-4 rounded-2xl border border-line-strong bg-surface-raised p-5 shadow-2xl zoom-in-95 duration-200">
					<div className="flex items-center gap-2">
						<FileDown className="h-5 w-5 text-accent" />
						<h2 className="text-base font-semibold text-foreground">Export PDF</h2>
					</div>

					<p className="text-sm leading-relaxed text-muted">
						The PDF is made with your browser's print dialog - the paged layout you see on screen is used as
						is, including page breaks and margins.
					</p>

					{tabs.length > 1 && (
						<TabScopePicker
							tabs={tabs}
							activeId={activeId}
							scope={scope}
							picked={picked}
							onScopeChange={setScope}
							onToggle={(id) =>
								setPicked((current) => {
									const next = new Set(current)
									if (next.has(id)) next.delete(id)
									else next.add(id)
									return next
								})
							}
						/>
					)}

					<ol className="flex flex-col gap-2 rounded-xl bg-[var(--overlay-hover)] p-3 text-[13px] text-muted">
						<li className="flex gap-2">
							<span className="shrink-0 font-semibold text-accent">1.</span>
							<span>
								For the destination, choose <strong className="text-foreground">Save as PDF</strong>
							</span>
						</li>
						<li className="flex gap-2">
							<span className="shrink-0 font-semibold text-accent">2.</span>
							<span>
								Open <strong className="text-foreground">More settings</strong> and turn off{' '}
								<strong className="text-foreground">Headers and footers</strong> - otherwise the URL and date
								are printed on every page
							</span>
						</li>
						<li className="flex gap-2">
							<span className="shrink-0 font-semibold text-accent">3.</span>
							<span>
								Leave <strong className="text-foreground">Margins</strong> on Default; the document margins
								already come from the ruler
							</span>
						</li>
					</ol>

					{/* Keputusan E1: petunjuk kecil tidak cukup - langkah ini paling
					    sering terlewat dan akibatnya langsung terlihat di berkas hasil,
					    jadi pengingatnya diletakkan terakhir, persis di atas tombol. */}
					<div className="rounded-xl border border-yellow-500/25 bg-yellow-500/10 px-3 py-2.5">
						<p className="text-[13px] font-semibold text-yellow-400">
							Don't skip step 2: turn off Headers and footers.
						</p>
						<p className="mt-1 text-xs leading-relaxed text-yellow-400/85">
							Chrome/Edge: <em>More settings</em> → uncheck <em>Headers and footers</em>. Firefox:{' '}
							<em>More settings</em> → turn off <em>Print headers and footers</em>. Otherwise the URL and date
							appear in the corners of every page.
						</p>
					</div>

					<div className="flex justify-end gap-2">
						<button
							type="button"
							onClick={() => setExportOpen(false)}
							className="rounded-xl px-4 py-2 text-sm text-muted transition-colors hover:bg-[var(--overlay-hover)] hover:text-foreground"
						>
							Cancel
						</button>
						<button
							type="button"
							onClick={print}
							disabled={preparing || chosen.length === 0}
							className="flex items-center gap-2 rounded-xl bg-accent px-4 py-2 text-sm font-medium text-accent-foreground transition-colors hover:bg-accent-hover disabled:opacity-60"
						>
							<Printer className="h-4 w-4" />
							{preparing ? 'Preparing…' : 'Open print dialog'}
						</button>
					</div>
				</div>
			</div>
		</>
	)
}
