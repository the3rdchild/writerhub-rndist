'use client'

import type { ReactNode } from 'react'
import { ExportPdfDialog } from '@/components/settings/export-pdf-dialog'
import { PageSetupDialog } from '@/components/settings/page-setup-dialog'
import { SettingsDialog } from '@/components/settings/settings-dialog'
import { ShortcutsDialog } from '@/components/settings/shortcuts-dialog'
import { ShareDialog } from '@/components/share/share-dialog'
import { ExportDocxDialog } from '@/features/document/export-docx-dialog'
import { useAppShortcuts } from '@/features/shortcuts/use-shortcuts'
import { TopBar } from './top-bar'

export function AppShell({ children }: { children: ReactNode }) {
	useAppShortcuts()

	return (
		<div className="flex h-dvh flex-col overflow-hidden bg-background">
			<TopBar />
			<main className="flex min-h-0 flex-1">{children}</main>
			<SettingsDialog />
			<ShortcutsDialog />
			<ExportPdfDialog />
			<PageSetupDialog />
			<ExportDocxDialog />
			<ShareDialog />
		</div>
	)
}
