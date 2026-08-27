'use client'

import type { Editor } from '@tiptap/react'
import type { ReactNode } from 'react'
import { Dropdown, DropdownItem } from '@/components/ui/dropdown'
import { cn } from '@/lib/utils'

export const DEFAULT_FONT_SIZE = 11

export function stepFontSize(editor: Editor | null, delta: number): void {
	if (!editor) return
	const parsed = Number.parseFloat(String(editor.getAttributes('textStyle').fontSize ?? ''))
	const base = Number.isFinite(parsed) ? parsed : DEFAULT_FONT_SIZE
	const next = Math.min(96, Math.max(6, Math.round(base) + delta))
	editor.chain().focus().setFontSize(`${next}pt`).run()
}

export function run(close: () => void, action: () => void) {
	action()
	close()
}

export function Menu({
	label,
	icon,
	children,
}: {
	label: string
	icon?: ReactNode
	children: (props: MenuRenderProps) => ReactNode
}) {
	return (
		<Dropdown
			trigger={({ open, toggle, id }) => (
				<button
					type="button"
					onClick={toggle}
					aria-haspopup="menu"
					aria-expanded={open}
					aria-controls={id}
					className={cn(
						'flex items-center gap-1.5 rounded-md px-2.5 py-1 text-sm transition-colors',
						open
							? 'bg-[var(--overlay-active)] text-foreground'
							: 'text-muted hover:bg-[var(--overlay-hover)] hover:text-foreground',
					)}
				>
					{icon && <span className="flex h-4 w-4 items-center justify-center">{icon}</span>}
					{label}
				</button>
			)}
		>
			{children}
		</Dropdown>
	)
}

export const Item = DropdownItem

/** Ditandatangani sekali di sini supaya tiap berkas menu tidak perlu mengulangnya. */
export type MenuRenderProps = { close: () => void }
