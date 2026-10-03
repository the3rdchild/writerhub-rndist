'use client'

import { EditMenu } from './edit-menu'
import { FileMenu } from './file-menu'
import { FormatMenu } from './format-menu'
import { HelpMenu } from './help-menu'
import { InsertMenu } from './insert-menu'
import { ToolsMenu } from './tools-menu'
import { ViewMenu } from './view-menu'

export function MenuBar() {
	return (
		<nav className="flex items-center gap-0.5" aria-label="Document menu">
			<FileMenu />
			<EditMenu />
			<ViewMenu />
			<InsertMenu />
			<FormatMenu />
			<ToolsMenu />
			<HelpMenu />
		</nav>
	)
}
