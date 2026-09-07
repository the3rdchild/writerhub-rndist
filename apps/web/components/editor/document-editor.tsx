'use client'

import { Clipboard, FileText, Upload, X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useDocument } from '@/features/document/document-context'
import { useDocumentImport } from '@/features/document/import-context'
import { useEditorInstance } from '@/features/editor/editor-context'
import { pageBlockRange, paginationKey } from '@/features/editor/pagination'
import { usePageStatus } from '@/features/editor/use-page-status'
import { useVisiblePage } from '@/features/editor/use-visible-page'
import { useGrammarCheck } from '@/features/grammar/use-grammar-check'
import { useSettings } from '@/features/settings/settings-context'
import { countWords } from '@/lib/utils'
import { DocumentCanvas } from './document-canvas'
import { PageIndicator } from './page-indicator'
import { TableControls } from './table-controls'
import { TableOptionsPanel } from './table-options-panel'
import { TocSettingsDialog } from './toc-settings-dialog'

export function DocumentEditor() {
	const { state, dispatch } = useDocument()
	const { settings } = useSettings()
	const { editor, setEditor } = useEditorInstance()
	const { error } = useGrammarCheck()

	const { openImport, importing, warnings, dismissWarnings } = useDocumentImport()

	const containerRef = useRef<HTMLDivElement>(null)

	/*
	 * Angka halaman itu hibrida: interaksi terakhir yang menang. Menyunting
	 * (klik, ketik) menyerahkannya ke kursor seperti bilah status Word;
	 * menggulir menyerahkannya ke lembar yang sedang terlihat — sehingga
	 * sekadar menjelajah lewat scroll tetap memberi tahu halaman, termasuk
	 * lembar yang isinya kode (blok kode tak punya posisi kursor teks untuk
	 * diikuti). Lompatan memindahkan keduanya: lembar secara instan, lalu
	 * kursor ke blok pertama lembar tujuan supaya lanjut menyunting berada
	 * di halaman yang terbaca.
	 */
	const pages = usePageStatus(editor)
	const [pageSource, setPageSource] = useState<'caret' | 'scroll'>('caret')
	const followScroll = useCallback(() => setPageSource('scroll'), [])
	const { page: visiblePage, scrollToPage } = useVisiblePage(followScroll)
	useEffect(
		function caretDrivesAfterSelection() {
			if (!editor || editor.isDestroyed) return
			const on = () => setPageSource('caret')
			editor.on('selectionUpdate', on)
			return () => {
				editor.off('selectionUpdate', on)
			}
		},
		[editor],
	)
	const currentPage = pageSource === 'caret' ? pages.page : visiblePage
	const jumpToPage = (target: number) => {
		scrollToPage(target)
		setPageSource('caret')
		if (!editor || editor.isDestroyed) return
		const state = paginationKey.getState(editor.state)
		const range = state ? pageBlockRange(state.blockPages, target - 1, editor.state.doc.content.size) : null
		if (range)
			editor
				.chain()
				.setTextSelection(Math.min(range.from + 1, editor.state.doc.content.size))
				.run()
	}

	const pasteFromClipboard = async () => {
		try {
			const text = await navigator.clipboard.readText()
			if (text) dispatch({ type: 'setText', text })
		} catch {}
	}

	return (
		<div
			ref={containerRef}
			className="relative flex min-w-0 flex-1 flex-col overflow-hidden rounded-2xl bg-surface-sunken"
		>
			{importing && (
				<div className="mx-4 mt-3 shrink-0 rounded-lg bg-accent/10 px-3 py-2">
					<p className="text-xs text-accent">Membaca dokumen Word…</p>
				</div>
			)}

			{warnings.length > 0 && (
				<div className="mx-4 mt-3 shrink-0 rounded-lg border border-yellow-500/20 bg-yellow-500/10 px-3 py-2">
					<div className="mb-1 flex items-start justify-between gap-2">
						<p className="text-xs font-medium text-yellow-400">
							Sebagian isi tidak punya padanan di editor ini:
						</p>
						<button
							type="button"
							onClick={dismissWarnings}
							aria-label="Tutup peringatan"
							className="shrink-0 text-yellow-400/70 transition-colors hover:text-yellow-400"
						>
							<X className="h-3.5 w-3.5" />
						</button>
					</div>
					<ul className="flex flex-col gap-0.5">
						{warnings.slice(0, 4).map((warning) => (
							<li key={warning} className="text-[11px] leading-relaxed text-yellow-400/80">
								{warning}
							</li>
						))}
					</ul>
				</div>
			)}

			{error && (
				<div className="mx-4 mt-3 shrink-0 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2">
					<p className="text-xs text-red-600">{error.message}</p>
				</div>
			)}

			{/* Lapisan interaksi tabel: handle baris/kolom & menu konteks. Tidak
			    memakan ruang - handle disematkan ke dalam tabel lewat dekorasi
			    ProseMirror; komponen ini hanya mendaftarkan plugin + merender menu. */}
			{editor && <TableControls editor={editor} />}

			{/* Panel samping opsi tabel (dibuka dari menu "..." sel). */}
			{editor && <TableOptionsPanel editor={editor} />}

			{state.file ? (
				<div className="flex flex-1 items-center justify-center px-6">
					<div className="flex max-w-full items-center gap-3 rounded-2xl bg-surface-raised px-5 py-4 shadow-[var(--page-shadow)]">
						<FileText className="h-6 w-6 shrink-0 text-accent" />
						<div className="min-w-0">
							<p className="truncate text-sm text-foreground">{state.file.name}</p>
							<p className="text-xs text-subtle">{(state.file.size / 1024).toFixed(0)} KB · siap dicek</p>
						</div>
						<button
							type="button"
							aria-label="Hapus dokumen"
							onClick={() => dispatch({ type: 'setFile', file: null })}
							className="ml-2 shrink-0 text-subtle transition-colors hover:text-foreground"
						>
							<X className="h-4 w-4" />
						</button>
					</div>
				</div>
			) : (
				<DocumentCanvas containerRef={containerRef} onReady={setEditor} currentPage={currentPage} />
			)}

			{/* Dialog setelan blok TOC; butuh konteks editor, jadi dipasang di sini. */}
			<TocSettingsDialog />

			<div className="flex shrink-0 items-center gap-3 bg-surface px-4 py-1.5">
				{!state.file && pages.pageCount > 1 && (
					<PageIndicator page={currentPage} pageCount={pages.pageCount} onJump={jumpToPage} />
				)}

				{settings.showWordCount && !state.file && (
					<span className="text-xs text-subtle">
						{countWords(state.text)} words · {state.text.length} characters
					</span>
				)}

				<div className="ml-auto flex items-center gap-1">
					<StatusButton icon={Upload} label="Unggah dokumen" onClick={() => openImport()} />
					<StatusButton icon={Clipboard} label="Tempel teks" onClick={pasteFromClipboard} />
				</div>
			</div>
		</div>
	)
}

function StatusButton({
	icon: Icon,
	label,
	onClick,
}: {
	icon: React.ComponentType<{ className?: string }>
	label: string
	onClick: () => void
}) {
	return (
		<button
			type="button"
			aria-label={label}
			title={label}
			onClick={onClick}
			className="rounded-md p-1.5 text-subtle transition-colors hover:bg-[var(--overlay-hover)] hover:text-foreground"
		>
			<Icon className="h-4 w-4" />
		</button>
	)
}
