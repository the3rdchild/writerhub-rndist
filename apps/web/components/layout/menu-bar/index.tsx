'use client'

import { useState } from 'react'
import { InsertImageDialog } from '@/components/editor/insert-image-dialog'
import { useEditorInstance } from '@/features/editor/editor-context'
import { EditMenu } from './edit-menu'
import { FileMenu } from './file-menu'
import { FormatMenu } from './format-menu'
import { HelpMenu } from './help-menu'
import { InsertMenu } from './insert-menu'
import { ToolsMenu } from './tools-menu'
import { ViewMenu } from './view-menu'

export function MenuBar() {
	const { editor } = useEditorInstance()

	// Dialog gambar dibuka dari menu Sisip tapi dirender di sini, di luar
	// Dropdown - kalau tidak, ia ikut terlepas begitu menunya menutup.
	const [imageDialogOpen, setImageDialogOpen] = useState(false)

	return (
		<>
			<nav className="flex items-center gap-0.5" aria-label="Menu dokumen">
				<FileMenu />
				<EditMenu />
				<ViewMenu />
				<InsertMenu onInsertImage={() => setImageDialogOpen(true)} />
				<FormatMenu />
				<ToolsMenu />
				<HelpMenu />
			</nav>

			<InsertImageDialog
				open={imageDialogOpen}
				onInsert={(attrs) => {
					editor?.chain().focus().setImage(attrs).run()
					setImageDialogOpen(false)
				}}
				onCancel={() => setImageDialogOpen(false)}
			/>
		</>
	)
}
