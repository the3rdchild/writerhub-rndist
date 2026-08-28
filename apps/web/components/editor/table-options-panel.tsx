'use client'

import type { Editor } from '@tiptap/react'
import { ChevronDown, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { PALETTE } from '@/components/editor/color-picker'
import { NO_COLOR } from '@/features/editor/custom-table'
import { columnWidths, setColumnWidths } from '@/features/editor/table-ops'
import { type TablePropsSnapshot, tablePropsAt } from '@/features/editor/table-props'
import { cn } from '@/lib/utils'

export const TABLE_OPTIONS_EVENT = 'writerhub:table-options'

/** Opens the Table options panel (hosted by DocumentEditor). */
export function openTableOptions(editor: Editor): void {
	editor.view.dom.dispatchEvent(new CustomEvent(TABLE_OPTIONS_EVENT, { bubbles: true }))
}

const INCH_PX = 96

type Unit = 'px' | 'in'

function fromPx(px: number, unit: Unit): number {
	const value = unit === 'in' ? px / INCH_PX : px
	return Math.round(value * 100) / 100
}

function toPx(value: number, unit: Unit): number {
	return Math.round(unit === 'in' ? value * INCH_PX : value)
}

const FIELD_CLASS =
	'w-full rounded-md border border-line bg-surface px-2 py-1 text-sm text-foreground outline-none transition-colors focus:border-accent disabled:cursor-not-allowed disabled:opacity-50'

function Section({ title, children }: { title: string; children: React.ReactNode }) {
	return (
		<details open className="group border-b border-line last:border-b-0">
			<summary className="flex cursor-pointer list-none items-center gap-1.5 px-3 py-2 text-xs font-semibold text-foreground [&::-webkit-details-marker]:hidden">
				<ChevronDown className="h-3.5 w-3.5 text-muted transition-transform group-open:rotate-0 -rotate-90" />
				{title}
			</summary>
			<div className="flex flex-col gap-2.5 px-3 pb-3">{children}</div>
		</details>
	)
}

/** Number input that commits on Enter/blur; remounts when the doc value changes. */
function MeasureInput({
	valuePx,
	onCommit,
	disabled,
	ariaLabel,
}: {
	valuePx: number | null
	onCommit: (px: number) => void
	disabled?: boolean
	ariaLabel: string
}) {
	const [unit, setUnit] = useState<Unit>('px')
	return (
		<div className="flex items-center gap-1.5">
			<input
				key={`${valuePx ?? 'auto'}-${unit}`}
				type="number"
				min={0}
				step={unit === 'in' ? 0.1 : 1}
				defaultValue={valuePx === null ? '' : fromPx(valuePx, unit)}
				disabled={disabled}
				aria-label={ariaLabel}
				placeholder="—"
				onKeyDown={(e) => {
					if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
				}}
				onBlur={(e) => {
					const value = Number.parseFloat(e.target.value)
					if (Number.isFinite(value) && value >= 0) onCommit(Math.max(1, toPx(value, unit)))
				}}
				className={cn(FIELD_CLASS, 'w-20')}
			/>
			<select
				aria-label="Satuan"
				value={unit}
				disabled={disabled}
				onChange={(e) => setUnit(e.target.value as Unit)}
				className={cn(FIELD_CLASS, 'w-16 shrink-0')}
			>
				<option value="px">px</option>
				<option value="in">inci</option>
			</select>
		</div>
	)
}

function CheckRow({
	label,
	checked,
	onChange,
	disabled,
	children,
}: {
	label: string
	checked: boolean
	onChange: (checked: boolean) => void
	disabled?: boolean
	children?: React.ReactNode
}) {
	return (
		<div className="flex flex-col gap-1.5">
			<label className="flex items-center gap-2 text-xs text-foreground">
				<input
					type="checkbox"
					checked={checked}
					disabled={disabled}
					onChange={(e) => onChange(e.target.checked)}
					className="h-3.5 w-3.5 accent-[var(--accent)] disabled:opacity-50"
				/>
				{label}
			</label>
			{children && <div className="pl-5.5">{children}</div>}
		</div>
	)
}

function Swatches({
	value,
	onPick,
	onClear,
	clearLabel,
}: {
	value: string | null
	onPick: (color: string) => void
	onClear?: () => void
	clearLabel?: string
}) {
	return (
		<div className="flex flex-col gap-1.5">
			<div className="grid grid-cols-8 gap-1">
				{PALETTE.flat().map((color) => (
					<button
						key={color}
						type="button"
						aria-label={color}
						title={color}
						onClick={() => onPick(color)}
						className={cn(
							'h-5 w-5 rounded border transition-transform hover:scale-110',
							value === color ? 'border-accent ring-1 ring-accent' : 'border-line-strong',
						)}
						style={{ backgroundColor: color }}
					/>
				))}
			</div>
			{onClear && (
				<button
					type="button"
					onClick={onClear}
					className="self-start rounded px-1 py-0.5 text-[11px] text-muted transition-colors hover:bg-[var(--overlay-hover)] hover:text-foreground"
				>
					{clearLabel}
				</button>
			)}
		</div>
	)
}

export function TableOptionsPanel({ editor, onClose }: { editor: Editor; onClose?: () => void }) {
	const [open, setOpen] = useState(false)
	const [snap, setSnap] = useState<TablePropsSnapshot | null>(null)

	useEffect(
		function openOnRequest() {
			const dom = editor.view.dom
			const handler = () => setOpen(true)
			dom.addEventListener(TABLE_OPTIONS_EVENT, handler)
			return () => dom.removeEventListener(TABLE_OPTIONS_EVENT, handler)
		},
		[editor],
	)

	useEffect(
		function trackTableProps() {
			if (!open) return
			const read = () => setSnap(tablePropsAt(editor))
			read()
			editor.on('transaction', read)
			return () => {
				editor.off('transaction', read)
			}
		},
		[editor, open],
	)

	const close = () => {
		setOpen(false)
		onClose?.()
	}

	if (!open) return null

	const chain = () => editor.chain()
	const setBorder = (patch: { color?: string | null; width?: number | null; style?: string | null }) =>
		chain().setTableBorder(patch).run()

	const setColumnWidth = (width: number) => {
		if (!snap) return
		const widths = columnWidths(editor, snap.tablePos)
		if (!widths) return
		widths[snap.colIndex] = width
		setColumnWidths(editor, snap.tablePos, widths)
	}

	return (
		<div className="absolute right-3 top-3 z-30 flex max-h-[calc(100%-1.5rem)] w-64 flex-col overflow-hidden rounded-xl border border-line-strong bg-surface-raised shadow-[var(--menu-shadow)]">
			<div className="flex items-center gap-2 border-b border-line px-3 py-2.5">
				<h2 className="text-sm font-semibold">Opsi tabel</h2>
				<button
					type="button"
					onClick={close}
					aria-label="Tutup opsi tabel"
					className="ml-auto text-muted transition-colors hover:text-foreground"
				>
					<X className="h-4 w-4" />
				</button>
			</div>

			{!snap ? (
				<p className="px-3 py-6 text-center text-xs text-muted">
					Letakkan kursor di dalam tabel untuk mengatur opsinya.
				</p>
			) : (
				<div className="min-h-0 flex-1 overflow-y-auto">
					<Section title="Tabel">
						<CheckRow
							label="Lebar tabel"
							checked={snap.tableWidth !== null}
							onChange={(checked) =>
								chain()
									.setTableWidth(checked ? (snap.tableWidth ?? 480) : null)
									.run()
							}
						>
							<MeasureInput
								ariaLabel="Lebar tabel"
								valuePx={snap.tableWidth}
								disabled={snap.tableWidth === null}
								onCommit={(px) => chain().setTableWidth(px).run()}
							/>
						</CheckRow>
					</Section>

					<Section title="Kolom">
						<div className="flex flex-col gap-1.5">
							<span className="text-xs text-foreground">Lebar kolom {snap.colIndex + 1}</span>
							<MeasureInput ariaLabel="Lebar kolom" valuePx={snap.columnWidth} onCommit={setColumnWidth} />
						</div>
					</Section>

					<Section title="Baris">
						<CheckRow
							label="Tinggi baris minimum"
							checked={snap.rowHeight !== null}
							onChange={(checked) =>
								chain()
									.setRowHeight(checked ? (snap.rowHeight ?? 32) : null)
									.run()
							}
						>
							<MeasureInput
								ariaLabel="Tinggi baris minimum"
								valuePx={snap.rowHeight}
								disabled={snap.rowHeight === null}
								onCommit={(px) => chain().setRowHeight(px).run()}
							/>
						</CheckRow>
						<CheckRow
							label="Ulangi baris header di tiap halaman"
							checked={snap.repeatHeader}
							onChange={() => chain().toggleTableHeaderRepeat().run()}
						/>
						<CheckRow
							label="Biarkan baris melintasi halaman"
							checked={!snap.cantSplit}
							onChange={(checked) => chain().setRowCantSplit(!checked).run()}
						/>
					</Section>

					<Section title="Sel">
						<div className="flex flex-col gap-1.5">
							<span className="text-xs text-foreground">Perataan vertikal sel</span>
							<select
								aria-label="Perataan vertikal sel"
								value={snap.verticalAlign ?? ''}
								onChange={(e) => {
									const value = e.target.value
									chain()
										.setCellVerticalAlign(value === '' ? null : (value as 'top' | 'middle' | 'bottom'))
										.run()
								}}
								className={FIELD_CLASS}
							>
								<option value="">Bawaan</option>
								<option value="top">Atas</option>
								<option value="middle">Tengah</option>
								<option value="bottom">Bawah</option>
							</select>
						</div>
						<div className="flex flex-col gap-1.5">
							<span className="text-xs text-foreground">Padding sel</span>
							<MeasureInput
								ariaLabel="Padding sel"
								valuePx={parsePadding(snap.cellPadding)}
								onCommit={(px) => chain().setCellPadding(`${px}px`).run()}
							/>
						</div>
					</Section>

					<Section title="Warna">
						<div className="flex flex-col gap-1.5">
							<span className="text-xs text-foreground">Bingkai tabel</span>
							<Swatches
								value={snap.borderColor}
								onPick={(color) =>
									setBorder({ color, width: snap.borderWidth ?? 1, style: snap.borderStyle ?? 'solid' })
								}
								onClear={() => setBorder({ color: null, width: null, style: null })}
								clearLabel="Tanpa bingkai"
							/>
							<div className="flex items-center gap-1.5">
								<input
									key={`bw-${snap.borderWidth ?? 'none'}`}
									type="number"
									min={1}
									defaultValue={snap.borderWidth ?? ''}
									aria-label="Ketebalan bingkai (px)"
									placeholder="px"
									onKeyDown={(e) => {
										if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
									}}
									onBlur={(e) => {
										const value = Number.parseFloat(e.target.value)
										if (Number.isFinite(value) && value > 0) {
											setBorder({
												width: Math.round(value),
												color: snap.borderColor ?? '#000000',
												style: snap.borderStyle ?? 'solid',
											})
										}
									}}
									className={cn(FIELD_CLASS, 'w-20')}
								/>
								<select
									aria-label="Gaya bingkai"
									value={snap.borderStyle ?? 'solid'}
									onChange={(e) =>
										setBorder({
											style: e.target.value,
											color: snap.borderColor ?? '#000000',
											width: snap.borderWidth ?? 1,
										})
									}
									className={FIELD_CLASS}
								>
									<option value="solid">Penuh</option>
									<option value="dashed">Putus-putus</option>
									<option value="dotted">Titik-titik</option>
									<option value="double">Ganda</option>
								</select>
							</div>
						</div>
						<div className="flex flex-col gap-1.5">
							<span className="text-xs text-foreground">Warna latar sel</span>
							<Swatches
								value={snap.cellBackground}
								onPick={(color) => chain().setCellAttribute('backgroundColor', color).run()}
								onClear={() => chain().setCellAttribute('backgroundColor', NO_COLOR).run()}
								clearLabel="Tanpa warna"
							/>
						</div>
					</Section>
				</div>
			)}
		</div>
	)
}

/** Uniform cell padding ("4px" or "4px 6px 4px 6px") → single px value when uniform. */
function parsePadding(padding: string | null): number | null {
	if (!padding) return null
	const parts = padding
		.split(/\s+/)
		.filter(Boolean)
		.map((part) => Number.parseFloat(part))
	if (parts.length === 0 || parts.some((part) => !Number.isFinite(part))) return null
	const first = parts[0]
	return parts.every((part) => part === first) ? first : null
}
