'use client'

import type { Editor } from '@tiptap/react'
import { TextQuote } from 'lucide-react'
import { Dropdown, DropdownItem } from '@/components/ui/dropdown'
import { LINE_HEIGHTS } from '@/features/editor/text-styles'
import { cn } from '@/lib/utils'

export function LineHeightControl({ editor, disabled }: { editor: Editor | null; disabled?: boolean }) {
	return (
		<Dropdown
			trigger={({ open, toggle, id }) => (
				<button
					type="button"
					onClick={toggle}
					disabled={disabled}
					aria-label="Spasi baris"
					title="Spasi baris"
					aria-haspopup="menu"
					aria-expanded={open}
					aria-controls={id}
					className={cn(
						'flex h-7 w-7 items-center justify-center rounded-md text-muted transition-colors',
						open ? 'bg-[var(--overlay-active)]' : 'hover:bg-[var(--overlay-hover)] hover:text-foreground',
						disabled && 'cursor-not-allowed opacity-40',
					)}
				>
					<TextQuote className="h-4 w-4" />
				</button>
			)}
		>
			{({ close }) => (
				<>
					{LINE_HEIGHTS.map((option) => (
						<DropdownItem
							key={option.value}
							onSelect={() => {
								editor?.chain().focus().setLineHeight(option.value).run()
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
