'use client'

import { FileText, MessageSquare } from 'lucide-react'
import { type Session, sessionLabel } from '@/features/sessions/session-context'
import { cn } from '@/lib/utils'
import { SyncBadge } from './sync-badge'
import { useTabInteractions } from './tab-interactions'
import { TabMenu } from './tab-menu'
import { TabNameInput } from './tab-name-input'

export function TabRow({ tab, index }: { tab: Session; index: number }) {
	const {
		activeId,
		renamingId,
		syncStatus,
		dropEdge,
		isDragging,
		select,
		startRename,
		cancelRename,
		commitRename,
		dragStart,
		dragEnter,
		drop,
		dragEnd,
	} = useTabInteractions()

	if (renamingId === tab.id) {
		return (
			<TabNameInput
				initialValue={tab.title}
				onCommit={(title) => commitRename(tab.id, title)}
				onCancel={cancelRename}
			/>
		)
	}

	const label = sessionLabel(tab)
	const active = tab.id === activeId
	const edge = dropEdge(tab.id)
	const unresolvedComments = tab.comments.filter((thread) => !thread.resolved).length

	return (
		<div
			draggable
			onDragStart={(event) => {
				event.dataTransfer.setData('text/plain', tab.id)
				event.dataTransfer.effectAllowed = 'move'
				dragStart(tab.id)
			}}
			onDragEnter={() => dragEnter(tab.id)}
			onDragOver={(event) => event.preventDefault()}
			onDrop={(event) => {
				event.preventDefault()
				drop(tab.id)
			}}
			onDragEnd={dragEnd}
			className={cn(
				'group flex items-center gap-2 rounded-lg border-y-2 border-transparent py-1 pl-2.5 pr-1 transition-colors',
				active
					? 'bg-[color-mix(in_srgb,var(--accent)_14%,transparent)] text-accent'
					: 'text-foreground hover:bg-[var(--overlay-hover)]',
				isDragging(tab.id) && 'opacity-40',
				edge === 'top' && 'border-t-accent',
				edge === 'bottom' && 'border-b-accent',
			)}
		>
			<button
				type="button"
				onClick={() => select(tab)}
				onDoubleClick={() => startRename(tab.id)}
				aria-expanded={active ? tab.outlineExpanded : undefined}
				className="flex min-w-0 flex-1 items-center gap-2 text-left"
			>
				<span className="w-4 shrink-0 text-center text-sm leading-none">
					{tab.emoji ?? <FileText className={cn('h-4 w-4', !active && 'text-subtle')} />}
				</span>
				<span className="truncate text-sm" title={label}>
					{label}
				</span>
			</button>

			{unresolvedComments > 0 && (
				<span
					title={`${unresolvedComments} komentar belum dibereskan`}
					className="flex shrink-0 items-center gap-1 rounded-full bg-[var(--overlay-active)] px-1.5 text-[11px] leading-5 text-muted"
				>
					<MessageSquare className="h-3 w-3" />
					{unresolvedComments}
				</span>
			)}

			<SyncBadge status={syncStatus(tab.id)} />

			<TabMenu tab={tab} index={index} />
		</div>
	)
}
