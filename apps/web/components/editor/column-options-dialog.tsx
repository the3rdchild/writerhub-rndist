'use client'

import type { Editor } from '@tiptap/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { resolveColumnSlots } from '@/features/editor/column-flow'
import {
	type ColumnLayout,
	type ColumnPreset,
	evenColumns,
	isEven,
	type LengthUnit,
	layoutPatch,
	presetColumns,
	pxToUnit,
	unitToPx,
	withCount,
	withSpacing,
	withWidth,
} from '@/features/editor/column-geometry'
import { FALLBACK_COLUMN_GAP } from '@/features/editor/column-measure'
import { type PageSetup, pageGeometry } from '@/features/editor/page-geometry'
import { columnRegionAt, type SectionColumns, sectionSpans } from '@/features/editor/section-break'
import { sectionRange } from '@/features/editor/section-scope'
import { cn } from '@/lib/utils'

/*
 * "More column options…" (KOL-11) - padanan dialog Columns Word: prasetel,
 * jumlah kolom, lebar & jarak tiap kolom (rata atau tidak), dan cakupan.
 * Hitungannya di column-geometry.ts; dialog ini hanya memegang draf dan
 * menuliskannya lewat perintah kolom yang sudah ada.
 */

const FIELD_CLASS =
	'w-full rounded-lg border border-line bg-surface px-2.5 py-1.5 text-sm text-foreground outline-none transition-colors focus:border-accent disabled:cursor-not-allowed disabled:opacity-50'

const MAX_COLUMNS = 6

type Scope = 'section' | 'selection' | 'page' | 'document'

const SCOPE_LABELS: Record<Scope, string> = {
	section: 'This section',
	selection: 'Selected text',
	page: 'This page',
	document: 'Whole document',
}

const PRESETS: { id: ColumnPreset; label: string; shape: number[] }[] = [
	{ id: 'one', label: 'One', shape: [1] },
	{ id: 'two', label: 'Two', shape: [1, 1] },
	{ id: 'three', label: 'Three', shape: [1, 1, 1] },
	{ id: 'left', label: 'Left', shape: [1, 2] },
	{ id: 'right', label: 'Right', shape: [2, 1] },
]

interface Context {
	width: number
	regionPos: number | null
	initial: ColumnLayout
	equal: boolean
	scopes: Scope[]
}

/** Keadaan awal dialog dari kursor: wilayah berkolom yang dimasukinya, atau dua kolom rata. */
function readContext(editor: Editor, baseSetup: PageSetup): Context {
	const { doc, selection } = editor.state
	const spans = sectionSpans(doc, baseSetup)
	const span = spans.filter((entry) => entry.pos <= selection.from).pop() ?? spans[0]
	const width = pageGeometry(span.setup).contentWidth
	const region = columnRegionAt(doc, selection.from, baseSetup)
	const columns = region?.span.columns ?? null
	let initial = evenColumns(width, 2, FALLBACK_COLUMN_GAP)
	if (columns && columns.count >= 2) {
		const gap = typeof columns.gap === 'number' ? columns.gap : FALLBACK_COLUMN_GAP
		const slots = resolveColumnSlots(width, columns.count, gap, columns.widths ?? null, columns.gaps ?? null)
		if (slots.length > 0) {
			initial = {
				widths: slots.map((slot) => slot.width),
				gaps: slots.slice(1).map((slot, index) => slot.left - (slots[index].left + slots[index].width)),
			}
		}
	}
	const scopes: Scope[] = [
		...(region ? (['section'] as const) : []),
		...(!selection.empty ? (['selection'] as const) : []),
		'page',
		'document',
	]
	return { width, regionPos: region?.span.pos ?? null, initial, equal: !columns?.widths, scopes }
}

function Preview({ layout, width }: { layout: ColumnLayout | null; width: number }) {
	const columns = layout ?? { widths: [width], gaps: [] }
	return (
		<div
			className="flex h-20 w-28 shrink-0 gap-0 rounded border border-line bg-surface p-1.5"
			aria-hidden="true"
		>
			{columns.widths.map((value, index) => (
				<div
					// biome-ignore lint/suspicious/noArrayIndexKey: kolom tidak punya identitas selain urutannya
					key={index}
					className="flex flex-col gap-[3px]"
					style={{
						width: `${(value / width) * 100}%`,
						marginLeft: index > 0 ? `${((columns.gaps[index - 1] ?? 0) / width) * 100}%` : 0,
					}}
				>
					{Array.from({ length: 8 }, (_, line) => (
						// biome-ignore lint/suspicious/noArrayIndexKey: garis hias
						<span key={line} className="h-[2px] rounded bg-[var(--border-strong)]" />
					))}
				</div>
			))}
		</div>
	)
}

export function ColumnOptionsDialog({
	editor,
	open,
	onClose,
	unit,
	baseSetup,
}: {
	editor: Editor | null
	open: boolean
	onClose: () => void
	unit: LengthUnit
	baseSetup: PageSetup
}) {
	const overlayRef = useRef<HTMLDivElement>(null)
	const [context, setContext] = useState<Context | null>(null)
	const [layout, setLayout] = useState<ColumnLayout | null>(null)
	const [equal, setEqual] = useState(true)
	const [scope, setScope] = useState<Scope>('page')

	/* Draf diisi SEKALI tiap dialog dibuka - setelan halaman yang dibuat ulang
	 * di tengah jalan tidak boleh menghapus apa yang sedang diketik. */
	const sourceRef = useRef({ editor, baseSetup })
	sourceRef.current = { editor, baseSetup }
	useEffect(
		function prefillFromCursor() {
			const source = sourceRef.current
			if (!open || !source.editor || source.editor.isDestroyed) return
			const next = readContext(source.editor, source.baseSetup)
			setContext(next)
			setLayout(next.initial)
			setEqual(next.equal)
			setScope(next.scopes[0])
		},
		[open],
	)

	useEffect(
		function lockScrollAndCloseOnEscape() {
			if (!open) return
			document.body.style.overflow = 'hidden'
			const onKey = (event: KeyboardEvent) => {
				if (event.key === 'Escape') onClose()
			}
			window.addEventListener('keydown', onKey)
			return () => {
				document.body.style.overflow = ''
				window.removeEventListener('keydown', onKey)
			}
		},
		[open, onClose],
	)

	const unitLabel = unit === 'cm' ? 'cm' : 'in'
	const step = unit === 'cm' ? 0.1 : 0.05
	const width = context?.width ?? 0
	const count = layout?.widths.length ?? 1
	const preset = useMemo<ColumnPreset | null>(() => {
		if (!layout) return 'one'
		if (isEven(layout)) return count === 2 ? 'two' : count === 3 ? 'three' : null
		if (count !== 2) return null
		const narrow = (width - layout.gaps[0]) / 3
		if (Math.abs(layout.widths[0] - narrow) < 1) return 'left'
		if (Math.abs(layout.widths[1] - narrow) < 1) return 'right'
		return null
	}, [layout, count, width])

	if (!open || !context) return null

	const gapNow = layout?.gaps[0] ?? FALLBACK_COLUMN_GAP
	const choosePreset = (id: ColumnPreset) => {
		const next = presetColumns(id, width, gapNow)
		setLayout(next)
		setEqual(id !== 'left' && id !== 'right')
	}
	const setCount = (value: number) => {
		const target = Math.min(MAX_COLUMNS, Math.max(1, Math.round(value)))
		if (target === 1) {
			setLayout(null)
			return
		}
		setLayout(withCount(layout ?? evenColumns(width, 2, gapNow), target, width))
		setEqual(true)
	}

	const apply = () => {
		if (!editor) return
		const patch = layout ? layoutPatch(equal ? evenColumns(width, count, gapNow) : layout) : null
		const columns: SectionColumns | null = patch
			? {
					count: patch.count,
					gap: patch.gap,
					...(patch.widths ? { widths: patch.widths } : {}),
					...(patch.gaps ? { gaps: patch.gaps } : {}),
				}
			: null
		const chain = editor.chain().focus()
		if (scope === 'section' && context.regionPos !== null) {
			if (patch) chain.setColumnsLayout(context.regionPos, patch).run()
			else chain.unsetColumns().run()
		} else if (scope === 'selection') {
			const { from, to } = editor.state.selection
			chain.applySectionColumns(columns, { from, to }).run()
		} else if (scope === 'page') {
			const range = sectionRange(editor, 'this_page')
			if (range) chain.applySectionColumns(columns, range).run()
		} else {
			chain.applySectionColumns(columns, { from: 0 }).run()
		}
		onClose()
	}

	const field = (value: number) => String(pxToUnit(value, unit))
	const read = (raw: string) => {
		const parsed = Number.parseFloat(raw.replace(',', '.'))
		return Number.isFinite(parsed) ? unitToPx(parsed, unit) : null
	}

	return (
		/* Klik latar hanya jalan keluar tambahan; padanan papan tiknya Escape,
		 * dipasang di efek lockScrollAndCloseOnEscape di atas. */
		// biome-ignore lint/a11y/useKeyWithClickEvents: Escape sudah menutup dialog
		<div
			ref={overlayRef}
			role="dialog"
			aria-modal="true"
			aria-label="Columns"
			className="fixed inset-0 z-[70] flex animate-in items-center justify-center bg-black/60 p-4 backdrop-blur-sm fade-in duration-200"
			onClick={(event) => {
				if (event.target === overlayRef.current) onClose()
			}}
		>
			<div className="flex max-h-full w-full max-w-md animate-in flex-col gap-4 overflow-y-auto rounded-2xl border border-line-strong bg-surface-raised p-5 shadow-2xl zoom-in-95 duration-200">
				<h2 className="text-base font-semibold text-foreground">Columns</h2>

				<div className="flex flex-col gap-1.5">
					<span className="text-xs font-medium text-muted">Presets</span>
					<div className="flex gap-2">
						{PRESETS.map((entry) => (
							<button
								key={entry.id}
								type="button"
								aria-pressed={preset === entry.id}
								onClick={() => choosePreset(entry.id)}
								className={cn(
									'flex w-16 flex-col items-center gap-1 rounded-lg border px-1.5 py-2 text-xs transition-colors',
									preset === entry.id
										? 'border-accent text-accent'
										: 'border-line text-muted hover:bg-[var(--overlay-hover)] hover:text-foreground',
								)}
							>
								<span
									className="flex h-7 w-9 gap-[3px] rounded-sm border border-current p-[3px]"
									aria-hidden="true"
								>
									{entry.shape.map((grow, index) => (
										<span
											// biome-ignore lint/suspicious/noArrayIndexKey: ikon prasetel statis
											key={index}
											className="rounded-[1px] bg-current opacity-40"
											style={{ flexGrow: grow }}
										/>
									))}
								</span>
								{entry.label}
							</button>
						))}
					</div>
				</div>

				<div className="flex items-start gap-4">
					<div className="flex flex-1 flex-col gap-3">
						<div className="grid grid-cols-[1fr_5rem] items-center gap-x-3">
							<label htmlFor="columns-count" className="text-xs font-medium text-muted">
								Number of columns
							</label>
							<input
								id="columns-count"
								type="number"
								min={1}
								max={MAX_COLUMNS}
								step={1}
								value={count}
								onChange={(event) => setCount(Number(event.target.value))}
								className={FIELD_CLASS}
							/>
						</div>
						<label className="flex items-center gap-2 text-xs text-muted">
							<input
								type="checkbox"
								checked={equal}
								disabled={!layout}
								onChange={(event) => {
									setEqual(event.target.checked)
									if (event.target.checked && layout) setLayout(evenColumns(width, count, gapNow))
								}}
							/>
							Equal column width
						</label>
					</div>
					<Preview layout={layout} width={width} />
				</div>

				{layout && (
					<table className="w-full border-separate border-spacing-y-1 text-xs">
						<thead>
							<tr className="text-left text-muted">
								<th className="font-medium">Col #</th>
								<th className="font-medium">Width ({unitLabel})</th>
								<th className="font-medium">Spacing ({unitLabel})</th>
							</tr>
						</thead>
						<tbody>
							{layout.widths.map((value, index) => {
								const locked = equal && index > 0
								return (
									// biome-ignore lint/suspicious/noArrayIndexKey: baris kolom berurutan
									<tr key={index}>
										<td className="pr-2 text-muted">{index + 1}</td>
										<td className="pr-2">
											<input
												type="number"
												aria-label={`Width of column ${index + 1}`}
												min={0}
												step={step}
												disabled={locked}
												value={field(value)}
												onChange={(event) => {
													const px = read(event.target.value)
													if (px !== null) setLayout(withWidth(layout, index, px, width, equal))
												}}
												className={FIELD_CLASS}
											/>
										</td>
										<td>
											{index < layout.widths.length - 1 && (
												<input
													type="number"
													aria-label={`Spacing after column ${index + 1}`}
													min={0}
													step={step}
													disabled={locked}
													value={field(layout.gaps[index] ?? 0)}
													onChange={(event) => {
														const px = read(event.target.value)
														if (px !== null) setLayout(withSpacing(layout, index, px, width, equal))
													}}
													className={FIELD_CLASS}
												/>
											)}
										</td>
									</tr>
								)
							})}
						</tbody>
					</table>
				)}

				<div className="grid grid-cols-[1fr_10rem] items-center gap-x-3">
					<label htmlFor="columns-scope" className="text-xs font-medium text-muted">
						Apply to
					</label>
					<select
						id="columns-scope"
						value={scope}
						onChange={(event) => setScope(event.target.value as Scope)}
						className={FIELD_CLASS}
					>
						{context.scopes.map((entry) => (
							<option key={entry} value={entry}>
								{SCOPE_LABELS[entry]}
							</option>
						))}
					</select>
				</div>

				<div className="flex justify-end gap-2">
					<button
						type="button"
						onClick={onClose}
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
