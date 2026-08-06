'use client'

import { Check, ChevronDown } from 'lucide-react'
import { Fragment } from 'react'
import { cn } from '@/lib/utils'
import { Dropdown, DropdownItem, DropdownLabel } from './dropdown'

export interface SelectOption<T> {
	value: T
	label: string
	/** Gaya pratinjau pada daftar, dipakai pemilih font dan gaya paragraf. */
	previewStyle?: React.CSSProperties
	/**
	 * Judul kelompok. Ditulis sekali di awal rentetan pilihan yang bernilai
	 * sama, jadi daftarnya harus sudah urut menurut kelompok.
	 */
	group?: string
}

/**
 * Bawa pilihan yang sedang aktif ke tengah daftar saat menu dibuka. Pada daftar
 * panjang - pemilih font sekarang berisi hampir tiga puluh nama - membuka menu
 * dan mendarat di huruf A tidak memberi tahu huruf apa yang sedang dipakai.
 */
function centerActiveOption(node: HTMLDivElement | null): void {
	const list = node?.parentElement
	if (!node || !list) return
	list.scrollTop = node.offsetTop - list.clientHeight / 2 + node.clientHeight / 2
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
				// relative supaya offsetTop pilihan aktif terukur dari daftar ini,
				// bukan dari kotak menunya.
				<div className="relative max-h-[320px] overflow-y-auto">
					{options.map((option, index) => {
						const selected = option.value === value
						const heading = option.group !== options[index - 1]?.group ? option.group : null

						return (
							<Fragment key={String(option.value)}>
								{heading && <DropdownLabel>{heading}</DropdownLabel>}
								<div ref={selected ? centerActiveOption : undefined}>
									<DropdownItem
										active={selected}
										icon={selected ? <Check className="h-3.5 w-3.5" /> : null}
										onSelect={() => {
											onChange(option.value)
											close()
										}}
									>
										<span style={option.previewStyle}>{option.label}</span>
									</DropdownItem>
								</div>
							</Fragment>
						)
					})}
				</div>
			)}
		</Dropdown>
	)
}
