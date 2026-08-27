'use client'

import { Ban } from 'lucide-react'
import type { ReactNode } from 'react'
import { Dropdown } from '@/components/ui/dropdown'
import { cn } from '@/lib/utils'
export const PALETTE = [
	['#000000', '#434343', '#666666', '#999999', '#b7b7b7', '#d9d9d9', '#efefef', '#ffffff'],
	['#e11d48', '#ea580c', '#eab308', '#16a34a', '#0891b2', '#2563eb', '#7c3aed', '#db2777'],
	['#fecdd3', '#fed7aa', '#fef08a', '#bbf7d0', '#a5f3fc', '#bfdbfe', '#ddd6fe', '#fbcfe8'],
] as const

export function ColorPicker({
	icon,
	label,
	value,
	onSelect,
	onClear,
	clearLabel,
}: {
	icon: ReactNode
	label: string
	value?: string
	onSelect: (color: string) => void
	onClear: () => void
	clearLabel: string
}) {
	return (
		<Dropdown
			menuClassName="min-w-0 p-2"
			trigger={({ open, toggle, id }) => (
				<button
					type="button"
					onClick={toggle}
					aria-label={label}
					title={label}
					aria-haspopup="menu"
					aria-expanded={open}
					aria-controls={id}
					className={cn(
						'flex h-7 w-7 flex-col items-center justify-center gap-0.5 rounded-md transition-colors',
						open ? 'bg-[var(--overlay-active)]' : 'hover:bg-[var(--overlay-hover)]',
					)}
				>
					<span className="text-muted">{icon}</span>
					<span className="h-[3px] w-4 rounded-full" style={{ backgroundColor: value ?? 'transparent' }} />
				</button>
			)}
		>
			{({ close }) => (
				<div className="flex flex-col gap-2">
					{PALETTE.map((row) => (
						<div key={row.join()} className="flex gap-1">
							{row.map((color) => (
								<button
									key={color}
									type="button"
									aria-label={color}
									title={color}
									onClick={() => {
										onSelect(color)
										close()
									}}
									className={cn(
										'h-5 w-5 rounded border transition-transform hover:scale-110',
										value === color ? 'border-accent ring-1 ring-accent' : 'border-line-strong',
									)}
									style={{ backgroundColor: color }}
								/>
							))}
						</div>
					))}
					<button
						type="button"
						onClick={() => {
							onClear()
							close()
						}}
						className="mt-1 flex items-center gap-2 rounded-md px-1 py-1 text-xs text-muted transition-colors hover:bg-[var(--overlay-hover)] hover:text-foreground"
					>
						<Ban className="h-3.5 w-3.5" />
						{clearLabel}
					</button>
				</div>
			)}
		</Dropdown>
	)
}
