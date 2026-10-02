'use client'

import type { CollabRole } from '@writer-hub/shared'
import { X } from 'lucide-react'
import { useState } from 'react'
import { cn } from '@/lib/utils'
import type { CollabNotice, Collaborator } from './binding'
import type { CollabPhase } from './session'

/** Label pendek fase sesi tab aktif, plus penjelasan di tooltip. */
const PHASES: Record<
	Exclude<CollabPhase, 'idle' | 'destroyed' | 'denied' | 'gone' | 'unavailable'>,
	{ label: string; title: string; tone: 'live' | 'busy' | 'warn' }
> = {
	connecting: { label: 'Connecting…', title: 'Connecting to live editing', tone: 'busy' },
	waiting: { label: 'Preparing…', title: 'Preparing live editing for this tab', tone: 'busy' },
	seeding: { label: 'Preparing…', title: 'Uploading this tab for live editing', tone: 'busy' },
	syncing: { label: 'Syncing…', title: 'Loading the latest changes', tone: 'busy' },
	synced: { label: 'Live', title: 'Changes are shared with collaborators as you type', tone: 'live' },
	offline: {
		label: 'Offline',
		title: 'Offline. Your changes are kept in this browser and sent when you are back online.',
		tone: 'warn',
	},
}

const TONE_DOT: Record<'live' | 'busy' | 'warn', string> = {
	live: 'bg-emerald-500',
	busy: 'bg-[var(--foreground-subtle)] animate-pulse',
	warn: 'bg-amber-500',
}

function initials(name: string): string {
	const parts = name.trim().split(/\s+/).filter(Boolean)
	if (parts.length === 0) return '?'
	return (
		parts.length === 1 ? parts[0].slice(0, 2) : `${parts[0][0]}${parts[parts.length - 1][0]}`
	).toUpperCase()
}

function Avatars({ people }: { people: Collaborator[] }) {
	if (people.length === 0) return null
	const shown = people.slice(0, 3)
	const rest = people.length - shown.length
	const names = people.map((person) => person.name).join(', ')
	return (
		<span className="flex items-center" title={`Also here: ${names}`}>
			<span className="sr-only">Also here: {names}</span>
			{shown.map((person) => (
				<span
					aria-hidden
					key={person.clientId}
					className="-ml-1 flex h-6 w-6 items-center justify-center rounded-full border-2 border-[var(--surface)] text-[10px] font-semibold text-white first:ml-0"
					style={{ backgroundColor: person.color }}
				>
					{initials(person.name)}
				</span>
			))}
			{rest > 0 && (
				<span aria-hidden className="ml-1 text-[11px] text-subtle">
					+{rest}
				</span>
			)}
		</span>
	)
}

function NoticeToast({ notice, onDismiss }: { notice: CollabNotice; onDismiss: () => void }) {
	const [copied, setCopied] = useState(false)
	return (
		<div
			role="status"
			className="pointer-events-auto flex w-[340px] items-start gap-2 rounded-lg border border-line-strong bg-surface-raised p-3 text-[12px] shadow-[var(--menu-shadow)]"
		>
			<span className="min-w-0 flex-1 text-foreground">
				{notice.message}
				{notice.copyText !== undefined && (
					<span className="mt-2 block">
						<button
							type="button"
							onClick={() => {
								void navigator.clipboard?.writeText(notice.copyText ?? '').then(() => setCopied(true))
							}}
							className="rounded border border-line-strong px-2 py-0.5 hover:bg-[var(--overlay-hover)]"
						>
							<span className="text-[12px]">{copied ? 'Copied' : 'Copy text'}</span>
						</button>
					</span>
				)}
			</span>
			<button
				type="button"
				onClick={onDismiss}
				aria-label="Dismiss"
				className="shrink-0 rounded p-0.5 text-muted hover:bg-[var(--overlay-hover)] hover:text-foreground"
			>
				<X className="h-3.5 w-3.5" />
			</button>
		</div>
	)
}

/** Fase sesi dan kolaborator; tidak tampil untuk tab yang tidak kolaboratif. */
export function CollabStatus({
	phase,
	role,
	collaborators,
}: {
	phase: CollabPhase | null
	role: CollabRole | null
	collaborators: Collaborator[]
}) {
	const meta = phase && phase in PHASES ? PHASES[phase as keyof typeof PHASES] : null
	if (!meta) return null
	const viewOnly = role !== null && role !== 'editor'
	return (
		<span className="mr-1 flex items-center gap-2" data-collab-phase={phase}>
			<Avatars people={collaborators} />
			<span
				title={viewOnly ? `${meta.title}. You can view but not edit.` : meta.title}
				className="flex items-center gap-1.5 rounded-full border border-line px-2 py-0.5 text-[12px] text-muted"
			>
				<span aria-hidden className={cn('h-2 w-2 rounded-full', TONE_DOT[meta.tone])} />
				{meta.label}
				{viewOnly && <span className="text-subtle">· View only</span>}
			</span>
		</span>
	)
}

/** Kabar yang tidak boleh lewat diam-diam (salinan yang dicadangkan saat state server di-reset). */
export function CollabNotices({
	notices,
	onDismiss,
}: {
	notices: CollabNotice[]
	onDismiss: (id: string) => void
}) {
	if (notices.length === 0) return null
	return (
		<div className="pointer-events-none fixed right-4 bottom-4 z-[80] flex flex-col gap-2">
			{notices.map((notice) => (
				<NoticeToast key={notice.id} notice={notice} onDismiss={() => onDismiss(notice.id)} />
			))}
		</div>
	)
}
