'use client'

import { formatPageNumber, type PageNumberFormat, type PageNumbering } from '@writer-hub/shared'
import { useEffect, useRef, useState } from 'react'
import { useEditorInstance } from '@/features/editor/editor-context'
import {
	readFurnitureFragmentVariants,
	setFurnitureVariantEnabled,
} from '@/features/editor/page-furniture/page-furniture-ydoc'
import { usePageFurniture } from '@/features/editor/page-furniture/use-page-furniture'
import { sectionSpans } from '@/features/editor/section-break'
import { isSectionScope, sectionRange } from '@/features/editor/section-scope'
import { usePageSetup } from '@/features/editor/use-page-setup'
import { useSessions } from '@/features/sessions/session-context'
import { useSettings } from '@/features/settings/settings-context'

/**
 * Dialog "Page numbers" — deret angkanya, terpisah dari wadahnya.
 *
 * Dipisah dari "Headers & footers" karena dua sumbu yang berbeda: isi
 * header/footer berlaku untuk satu tab utuh, sedangkan penomoran berlaku per
 * BAGIAN — itulah yang membuat "i, ii, iii" lalu "1, 2, 3" mungkin. Satu
 * pemilih cakupan untuk dua sumbu itulah yang dulu membingungkan.
 */

const FORMATS: { id: PageNumberFormat; label: string; sample: string }[] = [
	{ id: 'decimal', label: '1, 2, 3', sample: formatPageNumber(3, 'decimal') },
	{ id: 'lower-roman', label: 'i, ii, iii', sample: formatPageNumber(3, 'lower-roman') },
	{ id: 'upper-roman', label: 'I, II, III', sample: formatPageNumber(3, 'upper-roman') },
	{ id: 'lower-alpha', label: 'a, b, c', sample: formatPageNumber(3, 'lower-alpha') },
	{ id: 'upper-alpha', label: 'A, B, C', sample: formatPageNumber(3, 'upper-alpha') },
]

/* "Whole document" sengaja tidak ada: di produk ini satu dokumen memuat 1..n
 * tab, jadi yang sedang disunting selalu TAB ini — menyebutnya "seluruh
 * dokumen" justru menjanjikan lebih dari yang dilakukannya. */
type Scope = 'tab' | 'from_here' | 'this_page'

export function PageNumbersDialog() {
	const { pageNumbersOpen, setPageNumbersOpen } = useSettings()
	const { setup, setPageSetup } = usePageSetup()
	const { editor } = useEditorInstance()
	const { sessions, activeId, doc, activeTabId } = useSessions()
	const { furniture } = usePageFurniture()
	const overlayRef = useRef<HTMLDivElement>(null)

	function numberingAtCursor(): PageNumbering {
		if (editor && !editor.isDestroyed) {
			const spans = sectionSpans(editor.state.doc, setup)
			const span = [...spans].reverse().find((s) => s.pos <= editor.state.selection.from) ?? spans[0]
			if (span?.setup.pageNumbering) return span.setup.pageNumbering
		}
		return setup.pageNumbering ?? { format: 'decimal', restart: 'continue' }
	}

	const [numbering, setNumbering] = useState<PageNumbering>(numberingAtCursor)
	const [scope, setScope] = useState<Scope>('tab')
	const [restartAt, setRestartAt] = useState(1)
	const [error, setError] = useState<string | null>(null)
	/* Halaman pertama memakai perabotnya sendiri? Kalau ya, nomor dokumen tidak
	 * ikut tampil di sana - itulah cara Word/Docs menyembunyikan nomor sampul. */
	const [firstPageSeparate, setFirstPageSeparate] = useState(false)

	/* Draf dibaca ulang HANYA saat dialog dibuka; menyertakan numberingAtCursor
	 * di deps justru menimpa pilihan pengguna tiap kali kursor bergerak. */
	// biome-ignore lint/correctness/useExhaustiveDependencies: sengaja hanya saat dibuka
	useEffect(
		function resetOnOpen() {
			if (!pageNumbersOpen) return
			const current = numberingAtCursor()
			setNumbering(current)
			setRestartAt(typeof current.restart === 'number' ? current.restart : 1)
			setScope('tab')
			setError(null)
			setFirstPageSeparate(
				readFurnitureFragmentVariants(doc, activeTabId ?? '').some((entry) => entry.variant === 'first') ||
					Boolean(furniture?.header?.first || furniture?.footer?.first),
			)
		},
		[pageNumbersOpen],
	)

	useEffect(
		function lockScrollAndCloseOnEscape() {
			if (!pageNumbersOpen) return
			document.body.style.overflow = 'hidden'
			const onKeyDown = (event: KeyboardEvent) => {
				if (event.key === 'Escape') setPageNumbersOpen(false)
			}
			window.addEventListener('keydown', onKeyDown)
			return () => {
				document.body.style.overflow = ''
				window.removeEventListener('keydown', onKeyDown)
			}
		},
		[pageNumbersOpen, setPageNumbersOpen],
	)

	if (!pageNumbersOpen) return null

	const activeTab = sessions.find((s) => s.id === activeId)
	const sectionScopesAvailable = editor !== null && !editor.isDestroyed && !setup.pageless

	const apply = () => {
		const next: PageNumbering = {
			format: numbering.format,
			restart: numbering.restart === 'continue' ? 'continue' : Math.max(0, Math.floor(restartAt)),
			show: numbering.show !== false,
		}

		if (scope === 'tab') {
			setPageSetup({ ...setup, pageNumbering: next }, 'tab')
			setPageNumbersOpen(false)
			return
		}

		const range = editor && isSectionScope(scope) ? sectionRange(editor, scope) : null
		if (!range || !editor) {
			setError('Could not tell which page the cursor is on. Click in the document first.')
			return
		}
		editor.chain().focus().applySectionSetup({ pageNumbering: next }, range, setup).run()
		setPageNumbersOpen(false)
	}

	return (
		/* Klik latar hanya jalan keluar tambahan; padanan papan tiknya Escape. */
		// biome-ignore lint/a11y/useKeyWithClickEvents: Escape sudah menutup dialog
		<div
			ref={overlayRef}
			role="dialog"
			aria-modal="true"
			aria-label="Page numbers"
			className="fixed inset-0 z-[70] flex animate-in items-center justify-center bg-black/60 backdrop-blur-sm fade-in duration-200"
			onClick={(event) => {
				if (event.target === overlayRef.current) setPageNumbersOpen(false)
			}}
		>
			<div className="flex max-h-[90vh] w-full max-w-md animate-in flex-col gap-4 overflow-y-auto rounded-2xl border border-line-strong bg-surface-raised p-5 shadow-2xl zoom-in-95 duration-200">
				<h2 className="text-base font-semibold text-foreground">Page numbers</h2>

				<label className="flex flex-col gap-1">
					<span className="text-xs font-medium text-muted">Apply to</span>
					<select
						value={scope}
						onChange={(e) => setScope(e.target.value as Scope)}
						className="rounded-lg border border-line bg-surface px-2 py-1.5 text-sm text-foreground outline-none focus:border-accent"
					>
						<option value="tab">
							{activeTab ? `This tab: ${activeTab.title || 'Untitled'}` : 'This tab'}
						</option>
						<option value="from_here" disabled={!sectionScopesAvailable}>
							This point forward
						</option>
						<option value="this_page" disabled={!sectionScopesAvailable}>
							This page only
						</option>
					</select>
					{isSectionScope(scope) && (
						<span className="text-[11px] leading-relaxed text-subtle">
							{scope === 'this_page'
								? 'Inserts a section break before and after this page. Content may reflow onto another page if it no longer fits.'
								: 'Inserts a section break at the cursor; everything after it follows the new numbering.'}
						</span>
					)}
				</label>

				{/*
				 * Membersihkan penomoran adalah alurnya sendiri, bukan efek samping.
				 * Dipasangkan dengan "Apply to" di atas, satu kotak ini bisa membuang
				 * nomor dari seluruh tab, dari titik kursor ke belakang, atau dari
				 * satu halaman saja — tanpa menyentuh isi header/footernya.
				 */}
				<label className="flex items-center gap-2 text-sm text-foreground">
					<input
						type="checkbox"
						checked={numbering.show !== false}
						onChange={(event) => setNumbering((c) => ({ ...c, show: event.target.checked }))}
						className="h-4 w-4 accent-[var(--accent)]"
					/>
					Show page numbers
				</label>

				<div className="flex flex-col gap-1">
					<span className="text-xs font-medium text-muted">Position</span>
					<label className="flex items-center gap-2 text-sm text-foreground">
						<input
							type="checkbox"
							checked={!firstPageSeparate}
							onChange={(event) => {
								if (!activeTabId) return
								/* "Tampil di halaman pertama" = halaman pertama TIDAK punya
								 * perabot sendiri. Mematikannya membuat varian `first` kosong,
								 * jadi sampul tampil tanpa nomor - satu-satunya jalan
								 * menghilangkan nomor di halaman pertama. */
								const show = event.target.checked
								setFurnitureVariantEnabled(doc, activeTabId, 'first', !show, furniture)
								setFirstPageSeparate(!show)
							}}
							className="h-4 w-4 accent-[var(--accent)]"
						/>
						Show on first page
					</label>
					<span className="text-[11px] leading-relaxed text-subtle">
						Mematikannya memberi halaman pertama header/footer sendiri yang kosong — dipakai untuk sampul
						tanpa nomor. Menyalakannya kembali membuang isi khusus halaman pertama itu.
					</span>
				</div>

				<label className="flex flex-col gap-1">
					<span className="text-xs font-medium text-muted">Format</span>
					<select
						value={numbering.format}
						onChange={(e) => setNumbering((c) => ({ ...c, format: e.target.value as PageNumberFormat }))}
						className="rounded-lg border border-line bg-surface px-2 py-1.5 text-sm text-foreground outline-none focus:border-accent"
					>
						{FORMATS.map((format) => (
							<option key={format.id} value={format.id}>
								{format.label}
							</option>
						))}
					</select>
				</label>

				<div className="flex flex-col gap-1.5">
					<label className="flex items-center gap-2 text-sm text-foreground">
						<input
							type="radio"
							name="page-numbers-restart"
							checked={numbering.restart === 'continue'}
							onChange={() => setNumbering((c) => ({ ...c, restart: 'continue' }))}
							className="h-4 w-4 accent-[var(--accent)]"
						/>
						Continue from previous section
					</label>
					<label className="flex items-center gap-2 text-sm text-foreground">
						<input
							type="radio"
							name="page-numbers-restart"
							checked={typeof numbering.restart === 'number'}
							onChange={() => setNumbering((c) => ({ ...c, restart: restartAt }))}
							className="h-4 w-4 accent-[var(--accent)]"
						/>
						Start at
						<input
							type="number"
							min={0}
							value={typeof numbering.restart === 'number' ? numbering.restart : restartAt}
							onChange={(e) => {
								const value = Math.max(0, Math.floor(Number(e.target.value) || 0))
								setRestartAt(value)
								setNumbering((c) => ({ ...c, restart: value }))
							}}
							disabled={numbering.restart === 'continue'}
							className="w-20 rounded-lg border border-line bg-surface px-2 py-1 text-sm text-foreground outline-none focus:border-accent disabled:opacity-50"
						/>
					</label>
				</div>

				<span className="text-[11px] leading-relaxed text-subtle">
					Halaman depan romawi lalu isi arab: setel <em>i, ii, iii</em> untuk bagian pertama, taruh kursor di
					awal BAB 1, lalu pilih “This point forward” dengan format <em>1, 2, 3</em> — start at 1. Untuk
					membuang nomor dari sederet halaman, matikan <em>Show page numbers</em> dengan cakupan yang sesuai;
					halamannya tetap terhitung, hanya angkanya tidak digambar.
				</span>

				{error && <span className="text-[11px] text-yellow-500">{error}</span>}

				<div className="flex items-center justify-end gap-2">
					<button
						type="button"
						onClick={() => setPageNumbersOpen(false)}
						className="rounded-lg px-3 py-1.5 text-sm text-muted transition-colors hover:bg-[var(--overlay-hover)] hover:text-foreground"
					>
						Cancel
					</button>
					<button
						type="button"
						onClick={apply}
						className="rounded-lg bg-accent px-4 py-1.5 text-sm font-medium text-accent-foreground transition-colors hover:bg-accent-hover"
					>
						Apply
					</button>
				</div>
			</div>
		</div>
	)
}
