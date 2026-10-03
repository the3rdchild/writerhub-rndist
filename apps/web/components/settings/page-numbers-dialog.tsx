'use client'

import {
	formatPageNumber,
	PAGE_NUMBER_POSITIONS,
	type PageNumberFormat,
	type PageNumbering,
	type PageNumberPosition,
} from '@writer-hub/shared'
import { useEffect, useRef, useState } from 'react'
import { applyAcademicNumbering } from '@/features/chat/numbering-apply'
import { useEditorInstance } from '@/features/editor/editor-context'
import {
	readFurnitureFragmentVariants,
	removeFurnitureFragments,
	setFurnitureVariantEnabled,
	setPageFurnitureForTab,
} from '@/features/editor/page-furniture/page-furniture-ydoc'
import { usePageFurniture } from '@/features/editor/page-furniture/use-page-furniture'
import { SECTION_BREAK_NODE, sectionSpans } from '@/features/editor/section-break'
import { isSectionScope, sectionRange } from '@/features/editor/section-scope'
import { usePageSetup } from '@/features/editor/use-page-setup'
import { useSessions } from '@/features/sessions/session-context'
import { setNumberingPreset } from '@/features/sessions/ydoc'
import { useSettings } from '@/features/settings/settings-context'
import { cn } from '@/lib/utils'

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
 * dokumen" justru menjanjikan lebih dari yang dilakukannya.
 *
 * "This section" mengubah bagian tempat kursor berada tanpa pemisah baru.
 * Tanpanya, membuka dialog dengan kursor di BAB I menampilkan aturan BAB I,
 * dan Apply dengan cakupan bawaan "This tab" menimpakannya ke bagian depan -
 * romawinya hilang. */
type Scope = 'tab' | 'section' | 'from_here' | 'this_page'

const POSITION_LABEL: Record<PageNumberPosition, string> = {
	'top-left': 'Top left',
	'top-center': 'Top center',
	'top-right': 'Top right',
	'bottom-left': 'Bottom left',
	'bottom-center': 'Bottom center',
	'bottom-right': 'Bottom right',
}

/**
 * Letak nomor di halaman, dipilih langsung di gambar halaman kecil. `null`
 * berarti nomor tidak digambar aturan ini sendiri: ia datang dari token
 * {page} di header/footer, atau dari lencana sudut.
 */
function PositionPicker({
	label,
	value,
	onChange,
	offLabel,
	sample,
	disabled = false,
}: {
	label: string
	value: PageNumberPosition | null
	onChange: (value: PageNumberPosition | null) => void
	offLabel: string
	sample: string
	disabled?: boolean
}) {
	return (
		<fieldset className={cn('flex items-center gap-3 text-xs', disabled && 'opacity-50')} disabled={disabled}>
			<legend className="sr-only">{label}</legend>
			<div className="relative grid h-24 w-[4.5rem] shrink-0 grid-cols-3 grid-rows-[auto_1fr_auto] rounded border border-line bg-surface p-1">
				{PAGE_NUMBER_POSITIONS.map((position) => {
					const selected = value === position
					return (
						<button
							key={position}
							type="button"
							aria-label={`${label}: ${POSITION_LABEL[position]}`}
							aria-pressed={selected}
							title={POSITION_LABEL[position]}
							onClick={() => onChange(position)}
							className={cn(
								'flex h-4 items-center justify-center rounded-sm transition-colors',
								position.startsWith('top') ? 'row-start-1' : 'row-start-3',
								position.endsWith('left')
									? 'col-start-1'
									: position.endsWith('center')
										? 'col-start-2'
										: 'col-start-3',
								selected
									? 'bg-accent text-accent-foreground'
									: 'text-faint hover:bg-[var(--overlay-hover)] hover:text-foreground',
							)}
						>
							<span className="text-[9px] leading-none">{selected ? sample : '·'}</span>
						</button>
					)
				})}
				<div
					className="col-span-3 row-start-2 mx-1 my-1 rounded-sm bg-[var(--overlay-hover)]"
					aria-hidden="true"
				/>
			</div>
			<div className="flex min-w-0 flex-col gap-1">
				<span className="font-medium text-muted">{label}</span>
				<span className="text-foreground">{value ? POSITION_LABEL[value] : offLabel}</span>
				<button
					type="button"
					aria-pressed={value === null}
					onClick={() => onChange(null)}
					className={cn(
						'self-start rounded-md border px-2 py-0.5 transition-colors',
						value === null
							? 'border-accent/60 text-foreground'
							: 'border-line text-subtle hover:text-foreground',
					)}
				>
					{offLabel}
				</button>
			</div>
		</fieldset>
	)
}

export function PageNumbersDialog() {
	const { pageNumbersOpen, setPageNumbersOpen } = useSettings()
	const { setup, setPageSetup } = usePageSetup()
	const { editor } = useEditorInstance()
	const { sessions, activeId, doc, activeTabId } = useSessions()
	const { furniture } = usePageFurniture()
	const overlayRef = useRef<HTMLDivElement>(null)

	/** Pemisah bagian tempat kursor berada, atau `null` untuk bagian pertama (aturan tab). */
	function sectionAtCursor(): { pos: number; numbering: PageNumbering | undefined } | null {
		if (!editor || editor.isDestroyed) return null
		const spans = sectionSpans(editor.state.doc, setup)
		const span = [...spans].reverse().find((s) => s.pos <= editor.state.selection.from) ?? spans[0]
		if (!span || span.pos === 0 || spans.indexOf(span) === 0) return null
		return { pos: span.pos, numbering: span.setup.pageNumbering }
	}

	function numberingAtCursor(): PageNumbering {
		const section = sectionAtCursor()
		if (section?.numbering) return section.numbering
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
			setScope(sectionAtCursor() ? 'section' : 'tab')
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

	/* Pola karya ilmiah sekali tekan - bahan yang sama dengan pemasangan otomatis AI. */
	const applyAcademic = () => {
		if (!editor || editor.isDestroyed || !activeTabId) return
		const outcome = applyAcademicNumbering({
			editor,
			setup,
			setPageSetup,
			setFirstPageSeparate: (separate) => {
				setFurnitureVariantEnabled(doc, activeTabId, 'first', separate, furniture)
				return { ok: true, message: '' }
			},
			furniture: () => furniture,
			setFurnitureLine: (slot, variant, line) => {
				if (line) return { ok: false, message: '' }
				removeFurnitureFragments(doc, activeTabId, [{ slot, variant }])
				const lines = { ...(furniture?.[slot] ?? {}) }
				delete lines[variant]
				setPageFurnitureForTab(doc, activeTabId, { ...(furniture ?? {}), [slot]: lines })
				return { ok: true, message: '' }
			},
		})
		if (!outcome.ok) {
			setError('There is no level-1 heading such as "BAB I" or "PENDAHULUAN" yet - that is where 1 starts.')
			return
		}
		setNumberingPreset(doc, activeTabId, outcome.front ? 'academic' : 'academic-body')
		setPageNumbersOpen(false)
	}
	const sectionScopesAvailable = editor !== null && !editor.isDestroyed && !setup.pageless

	const apply = () => {
		const next: PageNumbering = {
			format: numbering.format,
			restart: numbering.restart === 'continue' ? 'continue' : Math.max(0, Math.floor(restartAt)),
			show: numbering.show !== false,
			// Letak nomor (penomoran karya ilmiah) tidak diatur dialog ini, jadi ikut apa adanya.
			...(numbering.position ? { position: numbering.position } : {}),
			...(numbering.openingPosition ? { openingPosition: numbering.openingPosition } : {}),
		}

		if (scope === 'tab') {
			setPageSetup({ ...setup, pageNumbering: next }, 'tab')
			setPageNumbersOpen(false)
			return
		}

		if (scope === 'section') {
			const section = sectionAtCursor()
			const node = section && editor ? editor.state.doc.nodeAt(section.pos) : null
			if (!section || !editor || node?.type.name !== SECTION_BREAK_NODE) {
				setPageSetup({ ...setup, pageNumbering: next }, 'tab')
			} else {
				const pageSetup = { ...((node.attrs.pageSetup as object | null) ?? {}), pageNumbering: next }
				editor.view.dispatch(
					editor.state.tr.setNodeMarkup(section.pos, undefined, { ...node.attrs, pageSetup }),
				)
			}
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
						<option value="section" disabled={!sectionScopesAvailable}>
							This section (where the cursor is)
						</option>
						<option value="from_here" disabled={!sectionScopesAvailable}>
							This point forward
						</option>
						<option value="this_page" disabled={!sectionScopesAvailable}>
							This page only
						</option>
					</select>
					{scope === 'section' && (
						<span className="text-[11px] leading-relaxed text-subtle">
							Changes the rule of the section the cursor is in, without adding a section break.
						</span>
					)}
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
					<span className="text-xs font-medium text-muted">First page</span>
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
						Turning it off gives the first page its own empty header/footer - used for a cover without a
						number. Turning it back on discards that first-page content.
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

				<div className="flex flex-col gap-3">
					<PositionPicker
						label="Number position"
						value={numbering.position ?? null}
						sample={formatPageNumber(3, numbering.format)}
						offLabel="From header/footer"
						onChange={(position) =>
							setNumbering((current) => {
								const { position: _old, openingPosition, ...rest } = current
								return position
									? { ...rest, position, ...(openingPosition ? { openingPosition } : {}) }
									: rest
							})
						}
					/>
					<PositionPicker
						label="Chapter-opening pages"
						value={numbering.openingPosition ?? null}
						sample={formatPageNumber(1, numbering.format)}
						offLabel="Same as other pages"
						disabled={!numbering.position}
						onChange={(openingPosition) =>
							setNumbering((current) => {
								const { openingPosition: _old, ...rest } = current
								return openingPosition ? { ...rest, openingPosition } : rest
							})
						}
					/>
					<span className="text-[11px] leading-relaxed text-subtle">
						The chosen position is drawn by this rule itself - on screen, in DOCX, and in print - without a{' '}
						{'{page}'} token in the header/footer. A chapter opening page is a page that starts with a level-1
						heading (BAB).
					</span>
				</div>

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

				<div className="flex flex-col gap-1.5 rounded-xl border border-line bg-surface px-3 py-2.5 text-[11px] leading-relaxed">
					<span className="text-subtle">
						Academic: no number on the cover, front matter <em>i, ii, iii</em> at the bottom center, then from
						BAB I numbers from 1 - bottom center on chapter opening pages, top right elsewhere.
					</span>
					<button
						type="button"
						onClick={applyAcademic}
						disabled={!sectionScopesAvailable}
						className="self-start rounded-lg border border-line bg-surface-raised px-2.5 py-1 font-medium text-foreground transition-colors hover:border-accent/60 disabled:opacity-50"
					>
						Apply the academic pattern
					</button>
				</div>

				<span className="text-[11px] leading-relaxed text-subtle">
					To hide numbers on a run of pages, turn off <em>Show page numbers</em> with the matching scope; the
					pages are still counted, only the number isn't drawn.
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
