'use client'

import type { HumanizerResult } from '@writer-hub/shared'
import { UserCheck } from 'lucide-react'
import { ChangeListPanel } from './change-list-panel'

export function HumanizerPanel() {
	return (
		<ChangeListPanel
			feature="humanizer"
			icon={UserCheck}
			emptyTitle="Buat teks terdengar manusiawi"
			emptyDescription="Ganti frasa kaku yang terasa hasil AI — terima atau tolak tiap saran"
			runLabel="Humanize Text"
			rerunLabel="Humanize Again"
			runningLabel="Memanusiakan..."
			noChangesLabel={(result) =>
				(result as HumanizerResult).changes_count === 0
					? 'Teks Anda sudah terdengar natural ✓'
					: 'Semua perubahan sudah diterapkan ✓'
			}
		/>
	)
}
