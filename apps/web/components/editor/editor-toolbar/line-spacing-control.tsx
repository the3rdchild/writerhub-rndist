'use client'

import type { Editor } from '@tiptap/react'
import { TextQuote } from 'lucide-react'
import { useState } from 'react'
import { CustomSpacingDialog } from '@/components/editor/custom-spacing-dialog'
import { SpacingMenuItems } from '@/components/editor/spacing-menu-items'
import { Dropdown } from '@/components/ui/dropdown'
import { cn } from '@/lib/utils'

/** Dropdown "Spasi baris & paragraf" di toolbar, ala Google Docs. */
export function LineSpacingControl({ editor, disabled }: { editor: Editor | null; disabled?: boolean }) {
	const [customOpen, setCustomOpen] = useState(false)

	return (
		<>
			<Dropdown
				trigger={({ open, toggle, id }) => (
					<button
						type="button"
						onClick={toggle}
						disabled={disabled}
						aria-label="Spasi baris & paragraf"
						title="Spasi baris & paragraf"
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
					<SpacingMenuItems
						editor={editor}
						close={close}
						onOpenCustomSpacing={() => {
							close()
							setCustomOpen(true)
						}}
					/>
				)}
			</Dropdown>
			<CustomSpacingDialog editor={editor} open={customOpen} onClose={() => setCustomOpen(false)} />
		</>
	)
}
