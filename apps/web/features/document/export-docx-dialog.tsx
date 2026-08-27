'use client'

import { FileDown } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { download, safeFilename } from '@/features/document/download'
import { exportDocx, mergeTabContents } from '@/features/document/export-docx'
import { pageGeometry } from '@/features/editor/page-geometry'
import { usePageSetup } from '@/features/editor/use-page-setup'
import { sessionLabel, useSessions } from '@/features/sessions/session-context'
import { useSettings } from '@/features/settings/settings-context'
import { buildSchema, fragmentToJSON } from '@/features/sync/serialize'
import { cn } from '@/lib/utils'

export function ExportDocxDialog() {
	const { docxExportOpen, setDocxExportOpen } = useSettings()
	const { setup } = usePageSetup()
	const { doc, documents, activeDocId, activeId, sessions } = useSessions()
	const overlayRef = useRef<HTMLDivElement>(null)

	const [mode, setMode] = useState<'all' | 'pick'>('all')
	const [picked, setPicked] = useState<Set<string>>(new Set())
	const [exporting, setExporting] = useState(false)
	useEffect(
		function resetSelectionOnOpen() {
			if (!docxExportOpen) return
			setMode('all')
			setPicked(new Set(activeId ? [activeId] : []))
		},
		[docxExportOpen, activeId],
	)

	useEffect(
		function lockScrollAndCloseOnEscape() {
			if (!docxExportOpen) return

			document.body.style.overflow = 'hidden'
			const onKeyDown = (event: KeyboardEvent) => {
				if (event.key === 'Escape') setDocxExportOpen(false)
			}
			window.addEventListener('keydown', onKeyDown)

			return () => {
				document.body.style.overflow = ''
				window.removeEventListener('keydown', onKeyDown)
			}
		},
		[docxExportOpen, setDocxExportOpen],
	)

	if (!docxExportOpen) return null

	const title = documents.find((dok) => dok.id === activeDocId)?.title ?? 'Untitled document'
	const chosen = mode === 'all' ? sessions : sessions.filter((tab) => picked.has(tab.id))

	const toggle = (id: string) => {
		setPicked((current) => {
			const next = new Set(current)
			if (next.has(id)) next.delete(id)
			else next.add(id)
			return next
		})
	}

	const doExport = async () => {
		if (chosen.length === 0 || exporting) return
		setExporting(true)
		try {
			const merged = mergeTabContents(chosen.map((tab) => fragmentToJSON(doc, tab.id)))
			const blob = await exportDocx(buildSchema().nodeFromJSON(merged), {
				title,
				geometry: pageGeometry(setup),
				setup,
			})
			download(blob, safeFilename(title, 'docx'))
			setDocxExportOpen(false)
		} finally {
			setExporting(false)
		}
	}

	return (
		<div
			ref={overlayRef}
			role="dialog"
			aria-modal="true"
			aria-label="Ekspor Word"
			className="fixed inset-0 z-50 flex animate-in items-center justify-center bg-black/60 backdrop-blur-sm fade-in duration-200"
			onClick={(event) => {
				if (event.target === overlayRef.current) setDocxExportOpen(false)
			}}
		>
			<div className="flex w-full max-w-md animate-in flex-col gap-4 rounded-2xl border border-line-strong bg-surface-raised p-5 shadow-2xl zoom-in-95 duration-200">
				<div className="flex items-center gap-2">
					<FileDown className="h-5 w-5 text-accent" />
					<h2 className="text-base font-semibold text-foreground">Ekspor Word (.docx)</h2>
				</div>

				<div className="flex flex-col gap-2">
					<label className="flex cursor-pointer items-center gap-2 rounded-xl px-3 py-2 text-sm text-foreground transition-colors hover:bg-[var(--overlay-hover)]">
						<input
							type="radio"
							name="docx-export-mode"
							checked={mode === 'all'}
							onChange={() => setMode('all')}
							className="accent-[var(--accent)]"
						/>
						Seluruh tab ({sessions.length})
					</label>
					<label className="flex cursor-pointer items-center gap-2 rounded-xl px-3 py-2 text-sm text-foreground transition-colors hover:bg-[var(--overlay-hover)]">
						<input
							type="radio"
							name="docx-export-mode"
							checked={mode === 'pick'}
							onChange={() => setMode('pick')}
							className="accent-[var(--accent)]"
						/>
						Tab terpilih
					</label>

					{mode === 'pick' && (
						<div className="flex max-h-56 flex-col gap-0.5 overflow-y-auto rounded-xl border border-line p-1.5">
							{sessions.map((tab) => (
								<label
									key={tab.id}
									className={cn(
										'flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-1.5 text-[13px] transition-colors hover:bg-[var(--overlay-hover)]',
										tab.id === activeId ? 'text-foreground' : 'text-muted',
									)}
								>
									<input
										type="checkbox"
										checked={picked.has(tab.id)}
										onChange={() => toggle(tab.id)}
										className="accent-[var(--accent)]"
									/>
									<span className="truncate">
										{tab.emoji ? `${tab.emoji} ` : ''}
										{sessionLabel(tab)}
									</span>
								</label>
							))}
						</div>
					)}
				</div>

				<p className="text-[13px] leading-relaxed text-muted">
					Tab digabung berurutan dalam satu berkas, masing-masing mulai di halaman baru.
				</p>

				<div className="flex justify-end gap-2">
					<button
						type="button"
						onClick={() => setDocxExportOpen(false)}
						className="rounded-xl px-4 py-2 text-sm text-muted transition-colors hover:bg-[var(--overlay-hover)] hover:text-foreground"
					>
						Batal
					</button>
					<button
						type="button"
						disabled={chosen.length === 0 || exporting}
						onClick={() => void doExport()}
						className="flex items-center gap-2 rounded-xl bg-accent px-4 py-2 text-sm font-medium text-accent-foreground transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
					>
						<FileDown className="h-4 w-4" />
						{exporting ? 'Mengekspor…' : `Ekspor ${chosen.length} tab`}
					</button>
				</div>
			</div>
		</div>
	)
}
