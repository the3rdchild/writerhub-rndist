'use client'

import { RefreshCw } from 'lucide-react'
import { ChangeListPanel } from './change-list-panel'

export function AiRewriterPanel() {
	return (
		<ChangeListPanel
			feature="ai_rewriter"
			icon={RefreshCw}
			emptyTitle="Rewrite your text"
			emptyDescription="Improve clarity and style - accept or dismiss each change"
			runLabel="Rewrite Text"
			rerunLabel="Rewrite Again"
			runningLabel="Rewriting..."
			noChangesLabel={() => 'All changes applied ✓'}
		/>
	)
}
