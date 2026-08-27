'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Ban } from 'lucide-react'
import { ColorPicker } from '@/components/editor/color-picker'
import {
	INCH,
	MIN_CUSTOM_SIDE,
	MAX_CUSTOM_SIDE,
	type PageMargins,
	type PageOrientation,
	type PageSizeId,
	type PageSetup,
	PAGE_SIZES,
	validateCustomSize,
} from '@/features/editor/page-geometry'
import { useEditorInstance } from '@/features/editor/editor-context'
import { isSectionScope, sectionRange } from '@/features/editor/section-scope'
import { usePageSetup } from '@/features/editor/use-page-setup'
import { useSettings } from '@/features/settings/settings-context'
import { useSessions } from '@/features/sessions/session-context'
import { cn } from '@/lib/utils'
type Scope = 'document' | 'tab' | 'from_here' | 'this_page'

function fromPx(px: number, unit: 'cm' | 'in'): number {
	return unit === 'cm' ? (px / INCH) * 2.54 : px / INCH
}

function toPx(value: number, unit: 'cm' | 'in'): number {
	return unit === 'cm' ? (value / 2.54) * INCH : value * INCH
}

function roundUnit(value: number): number {
	return Math.round(value * 100) / 100
}

export function PageSetupDialog() {
	const { pageSetupOpen, setPageSetupOpen, setDefaultPageSetup, settings } = useSettings()
	const { setup, setPageSetup } = usePageSetup()
	const { sessions, activeId } = useSessions()
	const { editor } = useEditorInstance()
	const overlayRef = useRef<HTMLDivElement>(null)
	const [draft, setDraft] = useState<PageSetup>(setup)
	const [scope, setScope] = useState<Scope>('document')
	const [customError, setCustomError] = useState<string | null>(null)
	useEffect(() => {
		if (pageSetupOpen) {
			setDraft(setup)
			setScope('document')
			setCustomError(null)
		}
	}, [pageSetupOpen, setup])

	useEffect(() => {
		if (!pageSetupOpen) return
		document.body.style.overflow = 'hidden'
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key === 'Escape') setPageSetupOpen(false)
		}
		window.addEventListener('keydown', onKeyDown)
		return () => {
			document.body.style.overflow = ''
			window.removeEventListener('keydown', onKeyDown)
		}
	}, [pageSetupOpen, setPageSetupOpen])

	const activeTab = sessions.find((s) => s.id === activeId)
	const unit = settings.measurementUnit
	const unitLabel = unit === 'cm' ? 'cm' : '"'

	const sizes = useMemo(() => Object.keys(PAGE_SIZES) as PageSizeId[], [])

	const setMargin = (field: keyof PageMargins, raw: number) => {
		setDraft((current) => ({
			...current,
			margins: { ...current.margins, [field]: toPx(Math.max(0, raw), unit) },
		}))
	}

	const setSize = (size: PageSizeId) => {
		setCustomError(null)
		setDraft((current) => ({ ...current, size }))
	}

	const setCustomSide = (field: 'customWidth' | 'customHeight', rawPx: number) => {
		setDraft((current) => ({ ...current, [field]: rawPx }))
	}
	const sectionScopesAvailable = editor !== null && !editor.isDestroyed && !setup.pageless

	const ok = () => {
		if (draft.size === 'custom') {
			const err = validateCustomSize(draft.customWidth ?? 0, draft.customHeight ?? 0)
			if (err) {
				setCustomError(err)
				return
			}
		}

		if (scope === 'document' || scope === 'tab') {
			setPageSetup(draft, scope)
			setPageSetupOpen(false)
			return
		}

		const range = editor && isSectionScope(scope) ? sectionRange(editor, scope) : null
		if (!range || !editor) {
			setCustomError('Could not tell which page the cursor is on. Click in the document first.')
			return
		}
		editor.chain().focus().applySectionSetup(draft, range, setup).run()
		setPageSetupOpen(false)
	}

	if (!pageSetupOpen) return null

	return (
		<div
			ref={overlayRef}
			role="dialog"
			aria-modal="true"
			aria-label="Page setup"
			className="fixed inset-0 z-[70] flex animate-in items-center justify-center bg-black/60 backdrop-blur-sm fade-in duration-200"
			onClick={(event) => {
				if (event.target === overlayRef.current) setPageSetupOpen(false)
			}}
		>
			<div className="flex w-full max-w-lg animate-in flex-col gap-4 rounded-2xl border border-line-strong bg-surface-raised p-5 shadow-2xl zoom-in-95 duration-200">
				<div className="flex items-center justify-between">
					<h2 className="text-base font-semibold text-foreground">Page setup</h2>
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
									: 'Inserts a section break at the cursor; everything after it follows the new layout.'}
							</span>
						)}
					</label>

					{/* Orientasi */}
					<div className="flex flex-col gap-1">
						<span className="text-xs font-medium text-muted">Orientation</span>
						<div className="flex gap-2">
							{(['portrait', 'landscape'] as PageOrientation[]).map((o) => (
								<button
									key={o}
									type="button"
									onClick={() => setDraft((c) => ({ ...c, orientation: o }))}
									className={cn(
										'rounded-lg border px-3 py-1.5 text-sm transition-colors',
										draft.orientation === o
											? 'border-accent bg-accent/10 text-accent'
											: 'border-line text-muted hover:text-foreground',
									)}
								>
									{o === 'portrait' ? 'Portrait' : 'Landscape'}
								</button>
							))}
						</div>
					</div>

					{/* Paper size */}
					<label className="flex flex-col gap-1">
						<span className="text-xs font-medium text-muted">Paper size</span>
						<select
							value={draft.size}
							onChange={(e) => setSize(e.target.value as PageSizeId)}
							className="rounded-lg border border-line bg-surface px-2 py-1.5 text-sm text-foreground outline-none focus:border-accent"
						>
							{sizes.map((id) => (
								<option key={id} value={id}>
									{PAGE_SIZES[id].label}
								</option>
							))}
						</select>
					</label>

					{draft.size === 'custom' && (
						<div className="col-span-2 flex flex-col gap-1">
							<span className="text-xs font-medium text-muted">
								Custom size ({unitLabel}) - limits {roundUnit(fromPx(MIN_CUSTOM_SIDE, unit))}–
								{roundUnit(fromPx(MAX_CUSTOM_SIDE, unit))}
								{unitLabel}
							</span>
							<div className="flex items-center gap-2">
								<input
									type="number"
									min={roundUnit(fromPx(MIN_CUSTOM_SIDE, unit))}
									max={roundUnit(fromPx(MAX_CUSTOM_SIDE, unit))}
									step={0.1}
									value={draft.customWidth ? roundUnit(fromPx(draft.customWidth, unit)) : ''}
									onChange={(e) => setCustomSide('customWidth', toPx(Number(e.target.value) || 0, unit))}
									className="w-24 rounded-lg border border-line bg-surface px-2 py-1.5 text-sm text-foreground outline-none focus:border-accent"
								/>
								<span className="text-xs text-subtle">×</span>
								<input
									type="number"
									min={roundUnit(fromPx(MIN_CUSTOM_SIDE, unit))}
									max={roundUnit(fromPx(MAX_CUSTOM_SIDE, unit))}
									step={0.1}
									value={draft.customHeight ? roundUnit(fromPx(draft.customHeight, unit)) : ''}
									onChange={(e) => setCustomSide('customHeight', toPx(Number(e.target.value) || 0, unit))}
									className="w-24 rounded-lg border border-line bg-surface px-2 py-1.5 text-sm text-foreground outline-none focus:border-accent"
								/>
								<span className="text-xs text-subtle">{unitLabel} (width × height)</span>
							</div>
							{customError && <span className="text-[11px] text-yellow-500">{customError}</span>}
						</div>
					)}

					{/* Page color */}
					<div className="flex flex-col gap-1">
						<span className="text-xs font-medium text-muted">Page color</span>
						<div className="flex items-center gap-2">
							<ColorPicker
								icon={<Ban className="h-4 w-4" />}
								label="Page color"
								value={draft.pageColor ?? undefined}
								onSelect={(color) => setDraft((c) => ({ ...c, pageColor: color }))}
								onClear={() => setDraft((c) => ({ ...c, pageColor: null }))}
								clearLabel="Match theme"
							/>
							<span className="text-xs text-subtle">{draft.pageColor ? draft.pageColor : 'Match theme'}</span>
						</div>
					</div>
				</div>

				{/* Margins */}
				<div className="flex flex-col gap-1">
					<span className="text-xs font-medium text-muted">Margins ({unitLabel})</span>
					<div className="grid grid-cols-4 gap-2">
						{(['top', 'bottom', 'left', 'right'] as const).map((field) => (
							<label key={field} className="flex flex-col gap-1">
								<span className="text-[11px] capitalize text-subtle">{field}</span>
								<input
									type="number"
									min={0}
									step={0.1}
									value={roundUnit(fromPx(draft.margins[field], unit))}
									onChange={(e) => setMargin(field, Number(e.target.value) || 0)}
									className="rounded-lg border border-line bg-surface px-2 py-1.5 text-sm text-foreground outline-none focus:border-accent"
								/>
							</label>
						))}
					</div>
				</div>

				<div className="flex items-center justify-between gap-2">
					<button
						type="button"
						onClick={() => setDefaultPageSetup(draft)}
						className="text-xs text-subtle underline-offset-2 transition-colors hover:text-foreground hover:underline"
						title="Save this layout as the default for new documents"
					>
						Set as default
					</button>
					<div className="flex gap-2">
						<button
							type="button"
							onClick={() => setPageSetupOpen(false)}
							className="rounded-lg px-3 py-1.5 text-sm text-muted transition-colors hover:bg-[var(--overlay-hover)] hover:text-foreground"
						>
							Cancel
						</button>
						<button
							type="button"
							onClick={ok}
							className="rounded-lg bg-accent px-4 py-1.5 text-sm font-medium text-accent-foreground transition-colors hover:bg-accent-hover"
						>
							OK
						</button>
					</div>
				</div>
			</div>
		</div>
	)
}
