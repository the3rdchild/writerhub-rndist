'use client'

import { Check, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Dropdown, DropdownItem } from './dropdown'

export interface SelectOption<T> {
	value: T
	label: string
	/** Gaya pratinjau pada daftar, dipakai pemilih font dan gaya paragraf. */
	previewStyle?: React.CSSProperties
}

interface ToolbarSelectProps<T extends string | number> {
	value: T
	options: ReadonlyArray<SelectOption<T>>
	onChange: (value: T) => void
	label: string
	/** Lebar tetap supaya toolbar tidak bergeser saat pilihan berganti. */
	width?: number
	disabled?: boolean
	/** Teks yang ditampilkan bila nilai sekarang tidak ada di daftar. */
	fallbackLabel?: string
}

export function ToolbarSelect<T extends string | number>({
	value,
	options,
	onChange,
	label,
	width = 120,
	disabled,
	fallbackLabel,
}: ToolbarSelectProps<T>) {
	const selected = options.find((option) => option.value === value)

	return (
		<Dropdown
			trigger={({ open, toggle, id }) => (
				<button
					type="button"
					onClick={toggle}
					disabled={disabled}
					aria-label={label}
					aria-haspopup="menu"
					aria-expanded={open}
					aria-controls={id}
					style={{ width }}
					className={cn(
						'flex h-7 items-center gap-1 rounded-md px-2 text-sm text-foreground transition-colors',
						open ? 'bg-[var(--overlay-active)]' : 'hover:bg-[var(--overlay-hover)]',
						disabled && 'cursor-not-allowed opacity-40',
					)}
				>
					<span className="flex-1 truncate text-left">
						{selected?.label ?? fallbackLabel ?? String(value)}
					</span>
					<ChevronDown className="h-3.5 w-3.5 shrink-0 text-subtle" />
				</button>
			)}
		>
			{({ close }) => (
				<div className="max-h-[320px] overflow-y-auto">
					{options.map((option) => (
						<DropdownItem
							key={String(option.value)}
							active={option.value === value}
							icon={option.value === value ? <Check className="h-3.5 w-3.5" /> : null}
							onSelect={() => {
								onChange(option.value)
								close()
							}}
						>
							<span style={option.previewStyle}>{option.label}</span>
						</DropdownItem>
					))}
				</div>
			)}
		</Dropdown>
	)
}
