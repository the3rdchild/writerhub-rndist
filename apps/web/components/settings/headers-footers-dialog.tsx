'use client'

import { formatPageNumber, type PageNumberFormat, type PageNumbering } from '@writer-hub/shared'
import { PanelBottom, PanelTop, Trash2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useEditorInstance } from '@/features/editor/editor-context'
import { useFurnitureEdit } from '@/features/editor/page-furniture/furniture-edit-context'
import type { FurnitureSlot, FurnitureVariant, PageFurniture } from '@/features/editor/page-furniture/model'
import {
	createEmptyFurnitureFragments,
	FURNITURE_SLOTS,
	FURNITURE_VARIANTS,
	readFurnitureFragmentVariants,
	removeFurnitureFragments,
} from '@/features/editor/page-furniture/page-furniture-ydoc'
import { usePageFurniture } from '@/features/editor/page-furniture/use-page-furniture'
import { footerMarginOf, headerMarginOf, INCH } from '@/features/editor/page-geometry'
import { sectionSpans } from '@/features/editor/section-break'
import { isSectionScope, sectionRange } from '@/features/editor/section-scope'
import { usePageSetup } from '@/features/editor/use-page-setup'
import { useSessions } from '@/features/sessions/session-context'
import { useSettings } from '@/features/settings/settings-context'
import { cn } from '@/lib/utils'

type Scope = 'document' | 'tab' | 'from_here' | 'this_page'

const FORMATS: { id: PageNumberFormat; label: string; sample: string }[] = [
	{ id: 'decimal', label: '1, 2, 3', sample: formatPageNumber(3, 'decimal') },
	{ id: 'lower-roman', label: 'i, ii, iii', sample: formatPageNumber(3, 'lower-roman') },
	{ id: 'upper-roman', label: 'I, II, III', sample: formatPageNumber(3, 'upper-roman') },
	{ id: 'lower-alpha', label: 'a, b, c', sample: formatPageNumber(3, 'lower-alpha') },
	{ id: 'upper-alpha', label: 'A, B, C', sample: formatPageNumber(3, 'upper-alpha') },
]

function fromPx(px: number, unit: 'cm' | 'in'): number {
	return unit === 'cm' ? (px / INCH) * 2.54 : px / INCH
}

function toPx(value: number, unit: 'cm' | 'in'): number {
	return unit === 'cm' ? (value / 2.54) * INCH : value * INCH
}

function roundUnit(value: number): number {
	return Math.round(value * 100) / 100
}

interface Draft {
	headerMargin: number
	footerMargin: number
	numbering: PageNumbering
}

/**
 * Dialog "Headers & footers" (T3/T4) — padanan dialog Google Docs plus bagian
 * penomoran ala Word. Isinya disunting di lembar (klik ganda margin), bukan
 * di sini; dialog mengurus margin, varian, dan penomoran per bagian.
 */
export function HeadersFootersDialog() {
	const { headersFootersOpen, setHeadersFootersOpen, settings } = useSettings()
	const { setup, setPageSetup } = usePageSetup()
	const { furniture, setFurniture } = usePageFurniture()
	const { editor } = useEditorInstance()
	const { doc, activeTabId, sessions, activeId } = useSessions()
	const { begin } = useFurnitureEdit()
	const overlayRef = useRef<HTMLDivElement>(null)

	const [draft, setDraft] = useState<Draft>(() => readDraft())
	const [scope, setScope] = useState<Scope>('document')
	const [restartAt, setRestartAt] = useState<number>(1)
	const [error, setError] = useState<string | null>(null)

	function variantsOf(variant: FurnitureVariant): boolean {
		if (readFurnitureFragmentVariants(doc, activeTabId ?? '').some((v) => v.variant === variant)) return true
		return FURNITURE_SLOTS.some((slot) => Boolean(furniture?.[slot]?.[variant]))
	}

	function numberingAtCursor(): PageNumbering {
		if (editor && !editor.isDestroyed) {
			const spans = sectionSpans(editor.state.doc, setup)
			const span = [...spans].reverse().find((s) => s.pos <= editor.state.selection.from) ?? spans[0]
			if (span?.setup.pageNumbering) return span.setup.pageNumbering
		}
		return setup.pageNumbering ?? { format: 'decimal', restart: 'continue' }
	}

	function readDraft(): Draft {
		return {
			headerMargin: headerMarginOf(setup),
			footerMargin: footerMarginOf(setup),
			numbering: numberingAtCursor(),
		}
	}

	/* Draf dibaca ulang HANYA saat dialog dibuka; menyertakan readDraft di deps
	 * justru menimpa suntingan pengguna tiap kali sumber bacaannya berubah. */
	// biome-ignore lint/correctness/useExhaustiveDependencies: sengaja hanya saat dibuka
	useEffect(
		function resetDraftOnOpen() {
			if (headersFootersOpen) {
				setDraft(readDraft())
				setScope('document')
				setError(null)
			}
		},
		[headersFootersOpen],
	)

	useEffect(
		function lockScrollAndCloseOnEscape() {
			if (!headersFootersOpen) return
			document.body.style.overflow = 'hidden'
			const onKeyDown = (event: KeyboardEvent) => {
				if (event.key === 'Escape') setHeadersFootersOpen(false)
			}
			window.addEventListener('keydown', onKeyDown)
			return () => {
				document.body.style.overflow = ''
				window.removeEventListener('keydown', onKeyDown)
			}
		},
		[headersFootersOpen, setHeadersFootersOpen],
	)

	const unit = settings.measurementUnit
	const unitLabel = unit === 'cm' ? 'cm' : '"'
	const activeTab = sessions.find((s) => s.id === activeId)
	const sectionScopesAvailable = editor !== null && !editor.isDestroyed && !setup.pageless

	const toggleVariant = (variant: FurnitureVariant, enabled: boolean) => {
		if (!activeTabId) return
		const targets = FURNITURE_SLOTS.map((slot) => ({ slot, variant }))
		if (enabled) {
			createEmptyFurnitureFragments(doc, activeTabId, targets)
			return
		}
		removeFurnitureFragments(doc, activeTabId, targets)
		/* Baris lama varian itu ikut dibuang supaya tidak menghidupkannya kembali. */
		const next: PageFurniture = {}
		for (const slot of FURNITURE_SLOTS) {
			const lines = { ...(furniture?.[slot] ?? {}) }
			delete lines[variant]
			if (Object.keys(lines).length > 0) next[slot] = lines
		}
		setFurniture(next)
	}

	/*
	 * Hapus satu slot seutuhnya - ketiga variannya sekaligus, fragmen kaya
	 * berikut baris lawasnya. Membuang fragmen saja tidak cukup: baris lawas
	 * (`pageFurniture`, dipakai tampilan baca-saja dan ekspor) akan
	 * menghidupkannya kembali di lembar berikutnya.
	 */
	const removeSlot = (slot: FurnitureSlot) => {
		if (!activeTabId) return
		removeFurnitureFragments(
			doc,
			activeTabId,
			FURNITURE_VARIANTS.map((variant) => ({ slot, variant })),
		)
		const next: PageFurniture = { ...(furniture ?? {}) }
		delete next[slot]
		setFurniture(next)
	}

	const hasSlot = (slot: FurnitureSlot): boolean =>
		Object.keys(furniture?.[slot] ?? {}).length > 0 ||
		readFurnitureFragmentVariants(doc, activeTabId ?? '').some((entry) => entry.slot === slot)

	const ok = () => {
		const numbering: PageNumbering = {
			format: draft.numbering.format,
			restart: draft.numbering.restart === 'continue' ? 'continue' : Math.max(0, Math.floor(restartAt)),
		}

		if (scope === 'document' || scope === 'tab') {
			setPageSetup(
				{
					...setup,
					headerMargin: draft.headerMargin,
					footerMargin: draft.footerMargin,
					pageNumbering: numbering,
				},
				scope,
			)
			setHeadersFootersOpen(false)
			return
		}

		const range = editor && isSectionScope(scope) ? sectionRange(editor, scope) : null
		if (!range || !editor) {
			setError('Could not tell which page the cursor is on. Click in the document first.')
			return
		}
		editor
			.chain()
			.focus()
			.applySectionSetup(
				{ headerMargin: draft.headerMargin, footerMargin: draft.footerMargin, pageNumbering: numbering },
				range,
				setup,
			)
			.run()
		setHeadersFootersOpen(false)
	}

	if (!headersFootersOpen) return null

	const editOnPage = (slot: 'header' | 'footer') => {
		setHeadersFootersOpen(false)
		begin({ slot })
	}

	return (
		/* Klik latar hanya jalan keluar tambahan; padanan papan tiknya Escape,
		 * dipasang di efek lockScrollAndCloseOnEscape di atas. */
		// biome-ignore lint/a11y/useKeyWithClickEvents: Escape sudah menutup dialog
		<div
			ref={overlayRef}
			role="dialog"
			aria-modal="true"
			aria-label="Headers & footers"
			className="fixed inset-0 z-[70] flex animate-in items-center justify-center bg-black/60 backdrop-blur-sm fade-in duration-200"
			onClick={(event) => {
				if (event.target === overlayRef.current) setHeadersFootersOpen(false)
			}}
		>
			<div className="flex max-h-[90vh] w-full max-w-lg animate-in flex-col gap-4 overflow-y-auto rounded-2xl border border-line-strong bg-surface-raised p-5 shadow-2xl zoom-in-95 duration-200">
				<div className="flex items-center justify-between">
					<h2 className="text-base font-semibold text-foreground">Headers & footers</h2>
				</div>

				<div className="grid grid-cols-2 gap-x-5 gap-y-3">
					{/* Apply to */}
					<label className="col-span-2 flex flex-col gap-1">
						<span className="text-xs font-medium text-muted">Apply to</span>
						<select
							value={scope}
							onChange={(e) => setScope(e.target.value as Scope)}
							className="rounded-lg border border-line bg-surface px-2 py-1.5 text-sm text-foreground outline-none focus:border-accent"
						>
							<option value="document">Whole document</option>
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

					{/* Margins */}
					<div className="col-span-2 flex flex-col gap-1">
						<span className="text-xs font-medium text-muted">Margins ({unitLabel})</span>
						<div className="grid grid-cols-2 gap-2">
							<label className="flex flex-col gap-1">
								<span className="text-[11px] text-subtle">Header from top</span>
								<input
									type="number"
									min={0}
									step={0.1}
									value={roundUnit(fromPx(draft.headerMargin, unit))}
									onChange={(e) =>
										setDraft((c) => ({ ...c, headerMargin: toPx(Number(e.target.value) || 0, unit) }))
									}
									className="rounded-lg border border-line bg-surface px-2 py-1.5 text-sm text-foreground outline-none focus:border-accent"
								/>
							</label>
							<label className="flex flex-col gap-1">
								<span className="text-[11px] text-subtle">Footer from bottom</span>
								<input
									type="number"
									min={0}
									step={0.1}
									value={roundUnit(fromPx(draft.footerMargin, unit))}
									onChange={(e) =>
										setDraft((c) => ({ ...c, footerMargin: toPx(Number(e.target.value) || 0, unit) }))
									}
									className="rounded-lg border border-line bg-surface px-2 py-1.5 text-sm text-foreground outline-none focus:border-accent"
								/>
							</label>
						</div>
					</div>

					{/* Layout variants */}
					<div className="col-span-2 flex flex-col gap-1.5">
						<span className="text-xs font-medium text-muted">Layout</span>
						<label className="flex items-center gap-2 text-sm text-foreground">
							<input
								type="checkbox"
								checked={variantsOf('first')}
								onChange={(e) => toggleVariant('first', e.target.checked)}
								className="h-4 w-4 accent-[var(--accent)]"
							/>
							Different first page
						</label>
						<label className="flex items-center gap-2 text-sm text-foreground">
							<input
								type="checkbox"
								checked={variantsOf('even')}
								onChange={(e) => toggleVariant('even', e.target.checked)}
								className="h-4 w-4 accent-[var(--accent)]"
							/>
							Different odd &amp; even pages
						</label>
						<span className="text-[11px] leading-relaxed text-subtle">
							Content is edited directly on the page — double-click the top or bottom margin, or:
						</span>
						<div className="flex gap-2">
							<button
								type="button"
								onClick={() => editOnPage('header')}
								className="flex items-center gap-1.5 rounded-lg border border-line px-2.5 py-1.5 text-xs text-muted transition-colors hover:border-accent hover:text-accent"
							>
								<PanelTop className="h-3.5 w-3.5" /> Edit header on page
							</button>
							<button
								type="button"
								onClick={() => editOnPage('footer')}
								className="flex items-center gap-1.5 rounded-lg border border-line px-2.5 py-1.5 text-xs text-muted transition-colors hover:border-accent hover:text-accent"
							>
								<PanelBottom className="h-3.5 w-3.5" /> Edit footer on page
							</button>
						</div>
						<div className="flex gap-2">
							{(['header', 'footer'] as const).map((slot) => (
								<button
									key={slot}
									type="button"
									disabled={!hasSlot(slot)}
									onClick={() => removeSlot(slot)}
									className="flex items-center gap-1.5 rounded-lg border border-line px-2.5 py-1.5 text-xs text-muted transition-colors hover:border-red-500 hover:text-red-500 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-line disabled:hover:text-muted"
								>
									<Trash2 className="h-3.5 w-3.5" /> Remove {slot}
								</button>
							))}
						</div>
					</div>

					{/* Page numbering */}
					<div className="col-span-2 flex flex-col gap-1.5 border-t border-line pt-3">
						<span className="text-xs font-medium text-muted">Page numbering</span>
						<label className="flex flex-col gap-1">
							<span className="text-[11px] text-subtle">Format</span>
							<select
								value={draft.numbering.format}
								onChange={(e) =>
									setDraft((c) => ({
										...c,
										numbering: { ...c.numbering, format: e.target.value as PageNumberFormat },
									}))
								}
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
									name="furniture-restart"
									checked={draft.numbering.restart === 'continue'}
									onChange={() =>
										setDraft((c) => ({ ...c, numbering: { ...c.numbering, restart: 'continue' } }))
									}
									className="h-4 w-4 accent-[var(--accent)]"
								/>
								Continue from previous section
							</label>
							<label className="flex items-center gap-2 text-sm text-foreground">
								<input
									type="radio"
									name="furniture-restart"
									checked={typeof draft.numbering.restart === 'number'}
									onChange={() => {
										setRestartAt(typeof draft.numbering.restart === 'number' ? draft.numbering.restart : 1)
										setDraft((c) => ({ ...c, numbering: { ...c.numbering, restart: 1 } }))
									}}
									className="h-4 w-4 accent-[var(--accent)]"
								/>
								Start at
								<input
									type="number"
									min={0}
									value={typeof draft.numbering.restart === 'number' ? draft.numbering.restart : restartAt}
									onChange={(e) => {
										const value = Math.max(0, Math.floor(Number(e.target.value) || 0))
										setRestartAt(value)
										setDraft((c) => ({ ...c, numbering: { ...c.numbering, restart: value } }))
									}}
									disabled={draft.numbering.restart === 'continue'}
									className="w-20 rounded-lg border border-line bg-surface px-2 py-1 text-sm text-foreground outline-none focus:border-accent disabled:opacity-50"
								/>
							</label>
						</div>
						<span className="text-[11px] leading-relaxed text-subtle">
							Applies with the scope above. Front matter roman (i, ii) then body arabic from 1: set roman here
							for the first section, insert a section break, then decimal — start at 1.
						</span>
					</div>
				</div>

				{error && <span className="text-[11px] text-yellow-500">{error}</span>}

				<div className="flex items-center justify-end gap-2">
					<button
						type="button"
						onClick={() => setHeadersFootersOpen(false)}
						className="rounded-lg px-3 py-1.5 text-sm text-muted transition-colors hover:bg-[var(--overlay-hover)] hover:text-foreground"
					>
						Cancel
					</button>
					<button
						type="button"
						onClick={ok}
						className={cn(
							'rounded-lg bg-accent px-4 py-1.5 text-sm font-medium text-accent-foreground transition-colors hover:bg-accent-hover',
						)}
					>
						Apply
					</button>
				</div>
			</div>
		</div>
	)
}
