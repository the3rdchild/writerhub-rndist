'use client'

import type { HumanizerResult } from '@writer-hub/shared'
import { UserCheck } from 'lucide-react'
import { ChangeListPanel } from './change-list-panel'

export function HumanizerPanel() {
	return (
		<ChangeListPanel
			feature="humanizer"
			icon={UserCheck}
			emptyTitle="Make your text sound human"
			emptyDescription="Replace stiff, AI-sounding phrasing — accept or dismiss each suggestion"
			runLabel="Humanize Text"
			rerunLabel="Humanize Again"
			runningLabel="Humanizing..."
			noChangesLabel={(result) =>
				(result as HumanizerResult).changes_count === 0
					? 'Your text already sounds natural ✓'
					: 'All changes applied ✓'
			}
		/>
	)
}
