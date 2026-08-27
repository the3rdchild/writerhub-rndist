'use client'

import type { Editor } from '@tiptap/react'
import { AlignCenter, AlignJustify, AlignLeft, AlignRight } from 'lucide-react'
import { IconButton } from './toolbar-parts'
import type { ToolbarState } from './toolbar-state'

export function AlignControls({
	editor,
	disabled,
	state,
}: {
	editor: Editor | null
	disabled?: boolean
	state: ToolbarState | null
}) {
	const options = [
		{ icon: AlignLeft, label: 'Rata kiri', value: 'left', active: state?.alignLeft },
		{ icon: AlignCenter, label: 'Rata tengah', value: 'center', active: state?.alignCenter },
		{ icon: AlignRight, label: 'Rata kanan', value: 'right', active: state?.alignRight },
		{ icon: AlignJustify, label: 'Rata kanan-kiri', value: 'justify', active: state?.alignJustify },
	] as const

	return (
		<>
			{options.map((option) => (
				<IconButton
					key={option.value}
					icon={option.icon}
					label={option.label}
					active={option.active}
					disabled={disabled}
					onClick={() => editor?.chain().focus().setTextAlign(option.value).run()}
				/>
			))}
		</>
	)
}
