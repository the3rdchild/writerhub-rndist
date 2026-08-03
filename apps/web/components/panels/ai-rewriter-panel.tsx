'use client'

import { RefreshCw } from 'lucide-react'
import { ChangeListPanel } from './change-list-panel'

export function AiRewriterPanel() {
	return (
		<ChangeListPanel
			feature="ai_rewriter"
			icon={RefreshCw}
			emptyTitle="Tulis ulang teks Anda"
			emptyDescription="Perbaiki kejelasan dan gaya — terima atau tolak tiap perubahan"
			runLabel="Rewrite Text"
			rerunLabel="Rewrite Again"
			runningLabel="Menulis ulang..."
			noChangesLabel={() => 'Semua perubahan sudah diterapkan ✓'}
		/>
	)
}
