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
		{ icon: AlignLeft, label: 'Align left', value: 'left', active: state?.alignLeft },
		{ icon: AlignCenter, label: 'Align center', value: 'center', active: state?.alignCenter },
		{ icon: AlignRight, label: 'Align right', value: 'right', active: state?.alignRight },
		{ icon: AlignJustify, label: 'Justify', value: 'justify', active: state?.alignJustify },
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
