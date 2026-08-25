'use client'

import { Check, ChevronDown } from 'lucide-react'
import { Fragment, type ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { Dropdown, DropdownItem, DropdownLabel } from './dropdown'

export interface SelectOption<T> {
	value: T
	label: string
	previewStyle?: React.CSSProperties
	icon?: ReactNode
	group?: string
}
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
	width?: number
	disabled?: boolean
	fallbackLabel?: string
	side?: 'bottom' | 'top'
}

export function ToolbarSelect<T extends string | number>({
	value,
	options,
	onChange,
	label,
	width = 120,
	disabled,
	fallbackLabel,
	side = 'bottom',
}: ToolbarSelectProps<T>) {
	const selected = options.find((option) => option.value === value)

	return (
		<Dropdown
			side={side}
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
					{selected?.icon}
					<span className="flex-1 truncate text-left">
						{selected?.label ?? fallbackLabel ?? String(value)}
					</span>
					<ChevronDown className="h-3.5 w-3.5 shrink-0 text-subtle" />
				</button>
			)}
		>
			{({ close }) => (
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
									icon={selected ? <Check className="h-3.5 w-3.5" /> : option.icon ?? null}
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
