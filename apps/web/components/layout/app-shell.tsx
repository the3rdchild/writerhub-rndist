'use client'

import type { ReactNode } from 'react'
import { SettingsDialog } from '@/components/settings/settings-dialog'
import { ExportPdfDialog } from '@/components/settings/export-pdf-dialog'
import { PageSetupDialog } from '@/components/settings/page-setup-dialog'
import { ShortcutsDialog } from '@/components/settings/shortcuts-dialog'
import { ShareDialog } from '@/components/share/share-dialog'
import { ExportDocxDialog } from '@/features/document/export-docx-dialog'
import { useAppShortcuts } from '@/features/shortcuts/use-shortcuts'
import { TopBar } from './top-bar'

export function AppShell({ children }: { children: ReactNode }) {
	// Dipasang sekali di sini, bukan per komponen: pintasan level aplikasi
	// berlaku di mana pun fokus berada.
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
