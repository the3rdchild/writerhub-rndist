'use client'

import type { ReactNode } from 'react'
import { SettingsDialog } from '@/components/settings/settings-dialog'
import { EditorInstanceProvider } from '@/features/editor/editor-context'
import { TopBar } from './top-bar'

export function AppShell({ children }: { children: ReactNode }) {
	return (
		// Instance editor dipakai TopBar maupun kanvas, jadi provider-nya
		// membungkus keduanya.
		<EditorInstanceProvider>
			<div className="flex h-dvh flex-col overflow-hidden bg-background">
				<TopBar />
				<main className="flex min-h-0 flex-1">{children}</main>
				<SettingsDialog />
			</div>
		</EditorInstanceProvider>
	)
}
