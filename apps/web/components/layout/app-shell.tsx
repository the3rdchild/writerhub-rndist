'use client'

import { type ReactNode, useEffect } from 'react'
import { SearchOverlay } from '@/components/editor/search/search-overlay'
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

/**
 * Satu-satunya kabar buruk yang tidak boleh disembunyikan: dokumennya terbuka,
 * tapi tidak ada yang menyimpannya. Ditempel di bawah bilah atas, bukan sebagai
 * dialog - editornya tetap bisa dipakai, dan peringatannya ikut tergulir pergi
 * hanya bersama tabnya sendiri.
 */
function PersistenceNotice() {
	const { persistenceFailed } = useSessions()
	if (!persistenceFailed) return null

	return (
		<div
			role="status"
			className="flex shrink-0 items-center gap-2 border-line-strong border-b bg-surface-raised px-3 py-1.5 text-[12px]"
		>
			<span className="font-medium text-yellow-500">Tidak tersimpan di peramban ini</span>
			<span className="text-muted">
				Penyimpanan lokal (IndexedDB) tidak bisa dipakai, jadi suntingan hanya hidup selama tab ini terbuka.
				Izinkan data situs untuk alamat ini, atau keluar dari mode penjelajahan pribadi, lalu muat ulang.
			</span>
		</div>
	)
}

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
				<PersistenceNotice />
				{/* `relative` demi bilah pencarian: ia melayang di pojok kanan atas
				    naskah, bukan ikut mendorong tata letaknya. */}
				<main className="relative flex min-h-0 flex-1">
					{children}
					<SearchOverlay />
				</main>
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
