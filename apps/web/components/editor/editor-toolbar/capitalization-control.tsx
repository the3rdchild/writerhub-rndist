'use client'

import type { Editor } from '@tiptap/react'
import { CaseSensitive } from 'lucide-react'
import { Dropdown, DropdownItem } from '@/components/ui/dropdown'
import { applyCapitalization } from '@/features/editor/capitalization'
import { cn } from '@/lib/utils'

export function CapitalizationControl({ editor, disabled }: { editor: Editor | null; disabled?: boolean }) {
	const options = [
		{ mode: 'lower' as const, label: 'huruf kecil' },
		{ mode: 'upper' as const, label: 'HURUF BESAR' },
		{ mode: 'title' as const, label: 'Huruf Kapital Setiap Kata' },
	]

	return (
		<Dropdown
			trigger={({ open, toggle, id }) => (
				<button
					type="button"
					onClick={toggle}
					disabled={disabled}
					aria-label="Kapitalisasi"
					title="Kapitalisasi"
					aria-haspopup="menu"
					aria-expanded={open}
					aria-controls={id}
					className={cn(
						'flex h-7 w-7 items-center justify-center rounded-md text-muted transition-colors',
						open ? 'bg-[var(--overlay-active)]' : 'hover:bg-[var(--overlay-hover)] hover:text-foreground',
						disabled && 'cursor-not-allowed opacity-40',
					)}
				>
					<CaseSensitive className="h-4 w-4" />
				</button>
			)}
		>
			{({ close }) => (
				<>
					{options.map((option) => (
						<DropdownItem
							key={option.mode}
							onSelect={() => {
								applyCapitalization(editor, option.mode)
								close()
							}}
						>
							{option.label}
						</DropdownItem>
					))}
				</>
			)}
		</Dropdown>
	)
}
