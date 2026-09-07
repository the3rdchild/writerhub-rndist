'use client'

import { type ReactNode, useEffect } from 'react'
import { ExportPdfDialog } from '@/components/settings/export-pdf-dialog'
import { HeadersFootersDialog } from '@/components/settings/headers-footers-dialog'
import { PageNumbersDialog } from '@/components/settings/page-numbers-dialog'
import { PageSetupDialog } from '@/components/settings/page-setup-dialog'
import { SettingsDialog } from '@/components/settings/settings-dialog'
import { ShortcutsDialog } from '@/components/settings/shortcuts-dialog'
import { ShareDialog } from '@/components/share/share-dialog'
import { ExportDocxDialog } from '@/features/document/export-docx-dialog'
import { EDITOR_READY_ATTRIBUTE } from '@/features/editor/editor-ready'
import { FurnitureEditProvider } from '@/features/editor/page-furniture/furniture-edit-context'
import { useSessions } from '@/features/sessions/session-context'
import { useAppShortcuts } from '@/features/shortcuts/use-shortcuts'
import { TopBar } from './top-bar'

export function AppShell({ children }: { children: ReactNode }) {
	useAppShortcuts()
	const { hydrated } = useSessions()

	/* Dipasang setelah React hidrasi DAN penyimpanan dokumen selesai dimuat —
	 * sejak titik itu penangan sudah terpasang dan interaksi tidak lagi hilang. */
	useEffect(
		function markEditorReady() {
			if (!hydrated) return
			document.body.setAttribute(EDITOR_READY_ATTRIBUTE, 'true')
			return () => document.body.removeAttribute(EDITOR_READY_ATTRIBUTE)
		},
		[hydrated],
	)

	return (
		<FurnitureEditProvider>
			<div className="flex h-dvh flex-col overflow-hidden bg-background">
				<TopBar />
				<main className="flex min-h-0 flex-1">{children}</main>
				<SettingsDialog />
				<ShortcutsDialog />
				<ExportPdfDialog />
				<PageSetupDialog />
				<HeadersFootersDialog />
				<PageNumbersDialog />
				<ExportDocxDialog />
				<ShareDialog />
			</div>
		</FurnitureEditProvider>
	)
}
