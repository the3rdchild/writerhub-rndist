'use client'

import type { Editor } from '@tiptap/react'
import { Baseline, Highlighter } from 'lucide-react'
import { ColorPicker } from '../color-picker'

export function ColorControls({
	editor,
	color,
	highlight,
}: {
	editor: Editor | null
	color?: string
	highlight?: string
}) {
	return (
		<>
			<ColorPicker
				icon={<Baseline className="h-4 w-4" />}
				label="Warna teks"
				value={color}
				clearLabel="Warna bawaan"
				onSelect={(value) => editor?.chain().focus().setColor(value).run()}
				onClear={() => editor?.chain().focus().unsetColor().run()}
			/>
			<ColorPicker
				icon={<Highlighter className="h-4 w-4" />}
				label="Warna sorotan"
				value={highlight}
				clearLabel="Tanpa sorotan"
				onSelect={(value) => editor?.chain().focus().toggleHighlight({ color: value }).run()}
				onClear={() => editor?.chain().focus().unsetHighlight().run()}
			/>
		</>
	)
}
