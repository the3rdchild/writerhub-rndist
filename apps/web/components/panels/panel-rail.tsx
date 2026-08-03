'use client'

import { Bot, type LucideIcon, RefreshCw, Search, SpellCheck, UserCheck } from 'lucide-react'
import { type PanelId, usePanels } from '@/features/analysis/panel-context'
import { cn } from '@/lib/utils'

const PANELS: Array<{ id: PanelId; icon: LucideIcon; label: string }> = [
	{ id: 'proofreader', icon: SpellCheck, label: 'Proofreader' },
	{ id: 'ai_detector', icon: Bot, label: 'AI Detector' },
	{ id: 'ai_rewriter', icon: RefreshCw, label: 'AI Rewriter' },
	{ id: 'humanizer', icon: UserCheck, label: 'Humanizer' },
	{ id: 'plagiarism', icon: Search, label: 'Plagiarism' },
]

/** Tool rail: berpindah modul tanpa meninggalkan draf yang sedang dikerjakan. */
export function PanelRail() {
	const { activePanel, togglePanel } = usePanels()

	return (
		<div className="flex w-14 shrink-0 flex-col items-center gap-1 rounded-2xl border border-line bg-surface-raised py-3">
			{PANELS.map(({ id, icon: Icon, label }) => {
				const isActive = activePanel === id
				return (
					<button
						key={id}
						type="button"
						onClick={() => togglePanel(id)}
						aria-label={label}
						aria-pressed={isActive}
						title={label}
						className={cn(
							'flex h-11 w-full items-center justify-center border-l-2 transition-colors',
							isActive
								? 'border-accent bg-accent/20 text-accent'
								: 'border-transparent text-subtle hover:bg-[var(--overlay-hover)] hover:text-foreground',
						)}
					>
						<Icon className="h-5 w-5" />
					</button>
				)
			})}
		</div>
	)
}
