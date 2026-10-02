'use client'

import { Check, ChevronDown } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Dropdown, DropdownItem } from '@/components/ui/dropdown'
import { FONT_SIZES } from '@/features/editor/text-styles'
import { NO_FORM_RESTORE } from '@/lib/no-form-restore'
import { cn } from '@/lib/utils'

const MIN_SIZE = 1
const MAX_SIZE = 400

/** Angka ketikan menjadi ukuran sah (kelipatan 0,5 pt), atau null bila bukan angka. */
export function parseFontSize(raw: string): number | null {
	const parsed = Number.parseFloat(raw.replace(',', '.'))
	if (!Number.isFinite(parsed)) return null
	return Math.min(MAX_SIZE, Math.max(MIN_SIZE, Math.round(parsed * 2) / 2))
}

/**
 * Ukuran huruf yang bisa DIKETIK seperti di Docs/Word, sekaligus dipilih dari
 * daftar. Dulu hanya daftar tetap: ukuran di luar daftar (13, 15, 17 pt) tidak
 * bisa dipakai (uji editor 2 Okt, TKS-18).
 */
export function FontSizeField({
	value,
	disabled,
	onChange,
}: {
	value: number
	disabled?: boolean
	onChange: (size: number) => void
}) {
	const [draft, setDraft] = useState(String(value))
	useEffect(
		function followSelection() {
			setDraft(String(value))
		},
		[value],
	)

	const commit = () => {
		const size = parseFontSize(draft)
		if (size === null) {
			setDraft(String(value))
			return
		}
		setDraft(String(size))
		if (size !== value) onChange(size)
	}

	return (
		<div
			className={cn(
				'flex h-7 items-center rounded-md text-sm text-foreground hover:bg-[var(--overlay-hover)]',
				disabled && 'pointer-events-none opacity-40',
			)}
		>
			<input
				type="text"
				inputMode="decimal"
				aria-label="Ukuran huruf"
				disabled={disabled}
				value={draft}
				{...NO_FORM_RESTORE}
				onChange={(event) => setDraft(event.target.value)}
				onFocus={(event) => event.target.select()}
				onBlur={commit}
				onKeyDown={(event) => {
					if (event.key === 'Enter') {
						event.preventDefault()
						commit()
					} else if (event.key === 'Escape') {
						setDraft(String(value))
						event.currentTarget.blur()
					}
				}}
				className="w-9 bg-transparent text-center outline-none"
			/>
			<Dropdown
				trigger={({ open, toggle, id }) => (
					<button
						type="button"
						onClick={toggle}
						disabled={disabled}
						aria-label="Font sizes"
						aria-haspopup="menu"
						aria-expanded={open}
						aria-controls={id}
						className="flex h-7 items-center pr-1 text-subtle"
					>
						<ChevronDown className="h-3.5 w-3.5" />
					</button>
				)}
			>
				{({ close }) => (
					<div className="max-h-[320px] overflow-y-auto">
						{FONT_SIZES.map((size) => (
							<DropdownItem
								key={size}
								active={size === value}
								icon={size === value ? <Check className="h-3.5 w-3.5" /> : null}
								onSelect={() => {
									onChange(size)
									close()
								}}
							>
								{size}
							</DropdownItem>
						))}
					</div>
				)}
			</Dropdown>
		</div>
	)
}
