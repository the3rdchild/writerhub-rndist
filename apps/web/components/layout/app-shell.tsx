'use client'

import type { ReactNode } from 'react'
import { SettingsDialog } from '@/components/settings/settings-dialog'
import { Sidebar } from './sidebar'

export function AppShell({ children }: { children: ReactNode }) {
	return (
		<div className="flex h-dvh overflow-hidden">
			<Sidebar />
			<main className="content-bg flex-1 overflow-auto">{children}</main>
			<SettingsDialog />
		</div>
	)
}
