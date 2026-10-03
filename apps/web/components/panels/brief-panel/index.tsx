'use client'

import { type BriefTab, briefField } from '@writer-hub/shared'
import { ClipboardList, Minus, Sparkles, X } from 'lucide-react'
import type { ReactNode } from 'react'
import { useBrief } from '@/features/brief/brief-context'
import { useChat } from '@/features/chat/chat-context'
import { cn } from '@/lib/utils'
import { FormatTab } from './format-tab'
import { ResearchTab } from './research-tab'

const TABS: { id: BriefTab; label: string }[] = [
	{ id: 'research', label: 'Research' },
	{ id: 'format', label: 'Format' },
]

/**
 * Panel Metadata - menempel di kiri panel AI Chat.
 *
 * Di layar lebar ia melayang di atas halaman, bukan mendorongnya: kertas yang
 * menyempit setiap kali panel ini dibuka akan memaksa naskah dipaginasi ulang
 * hanya untuk mengisi satu isian. Di layar sempit tidak ada halaman yang
 * cukup lebar untuk ditimpa, jadi ia menutupi panel chat sendiri.
 */
export function BriefPanel() {
	const { panel, docId, brief, minimizePanel, closePanel, setPanelTab, openPanel } = useBrief()
	if (!panel.open) return null

	const proposals = brief.proposals.length

	/*
	 * Terminimalkan: tab tegak yang menempel di tepi kiri panel chat. Ia muat
	 * di celah antara kertas dan panel, jadi tidak menutupi penggaris - penanda
	 * margin kanan ada persis di atas sana dan harus tetap bisa diseret.
	 */
	if (panel.minimized) {
		return (
			<button
				type="button"
				onClick={() => openPanel({ tab: panel.tab })}
				aria-label={
					proposals > 0
						? `Open metadata - ${proposals} AI ${proposals === 1 ? 'suggestion' : 'suggestions'}`
						: 'Open metadata'
				}
				title="Open metadata"
				className="absolute top-14 right-[calc(100%+0.25rem)] z-40 flex flex-col items-center gap-1.5 rounded-lg bg-surface px-1 py-2 text-foreground shadow-lg ring-1 ring-line transition-colors hover:bg-surface-raised"
			>
				<ClipboardList className="h-3.5 w-3.5 text-accent" />
				<span className="rotate-180 text-[11px] leading-none [writing-mode:vertical-rl]">Metadata</span>
				{proposals > 0 && (
					<span className="rounded-full bg-accent px-1 text-[10px] leading-4 text-accent-foreground">
						{proposals}
					</span>
				)}
			</button>
		)
	}

	return (
		<section
			aria-label="Document metadata"
			className="absolute inset-0 z-40 flex flex-col overflow-hidden rounded-2xl bg-surface text-sm shadow-2xl ring-1 ring-line lg:inset-auto lg:top-0 lg:right-[calc(100%+0.75rem)] lg:bottom-0 lg:w-[340px]"
		>
			<header className="flex shrink-0 items-center justify-between gap-2 px-4 py-2.5">
				<h2 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
					<ClipboardList className="h-4 w-4 text-accent" />
					Metadata
				</h2>
				<div className="flex items-center gap-0.5">
					<HeaderButton label="Minimalkan" onClick={minimizePanel}>
						<Minus className="h-4 w-4" />
					</HeaderButton>
					<HeaderButton label="Close metadata" onClick={closePanel}>
						<X className="h-4 w-4" />
					</HeaderButton>
				</div>
			</header>

			<div className="flex shrink-0 gap-1 px-4 pb-2 text-xs" role="tablist" aria-label="Metadata sections">
				{TABS.map((tab) => (
					<button
						key={tab.id}
						type="button"
						role="tab"
						aria-selected={panel.tab === tab.id}
						onClick={() => setPanelTab(tab.id)}
						className={cn(
							'flex-1 rounded-lg py-1.5 text-xs font-medium transition-colors',
							panel.tab === tab.id
								? 'bg-surface-raised text-foreground'
								: 'text-subtle hover:bg-[var(--overlay-hover)] hover:text-foreground',
						)}
					>
						{tab.label}
					</button>
				))}
			</div>

			{panel.highlight.length > 0 && <RequestBanner />}

			<div className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-surface-inset p-4">
				{docId === null ? (
					<p className="text-center text-xs text-subtle">Open a document to fill in its metadata.</p>
				) : panel.tab === 'research' ? (
					<ResearchTab />
				) : (
					<FormatTab />
				)}
			</div>
		</section>
	)
}

/** Permintaan `request_brief` yang sedang menunggu - dan jalan untuk menjawabnya dari sini juga. */
function RequestBanner() {
	const { panel, brief } = useBrief()
	const { pendingAsk, answerAsk } = useChat()
	const waiting = pendingAsk?.name === 'request_brief' ? pendingAsk : null
	const remaining = panel.highlight.filter((key) => !brief.entries[key])

	return (
		<div className="mx-4 mb-2 flex flex-col gap-1.5 rounded-xl border border-accent/25 bg-accent/5 px-3 py-2 text-[11px]">
			<p className="flex items-center gap-1.5 text-xs font-medium text-accent">
				<Sparkles className="h-3.5 w-3.5" />
				AI meminta Anda melengkapi
			</p>
			{panel.message && <p className="text-xs leading-snug text-foreground">{panel.message}</p>}
			<p className="text-[11px] text-subtle">
				{remaining.length === 0
					? 'Everything is filled in.'
					: `Still empty: ${remaining.map((key) => briefField(key)?.label ?? key).join(', ')}`}
			</p>
			{waiting && (
				<button
					type="button"
					onClick={() => answerAsk(waiting, {})}
					className="self-start rounded-full bg-accent px-3 py-1 text-[11px] font-medium text-accent-foreground transition-colors hover:bg-accent-hover"
				>
					Done, continue
				</button>
			)}
		</div>
	)
}

function HeaderButton({
	label,
	onClick,
	children,
}: {
	label: string
	onClick: () => void
	children: ReactNode
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			aria-label={label}
			title={label}
			className="rounded-md p-1 text-subtle transition-colors hover:bg-[var(--overlay-hover)] hover:text-foreground"
		>
			{children}
		</button>
	)
}

/**
 * Jalan masuk di header AI Chat, di kiri tombol tutup. Titiknya hanya
 * menyala untuk usulan AI yang menunggu - brief yang kosong bukan kesalahan:
 * brosur tidak butuh metadata penelitian.
 */
export function BriefToggleButton() {
	const { panel, brief, openPanel, closePanel } = useBrief()
	const open = panel.open && !panel.minimized
	const proposals = brief.proposals.length

	return (
		<button
			type="button"
			onClick={() => (open ? closePanel() : openPanel({ tab: panel.tab }))}
			aria-pressed={open}
			title={
				proposals > 0
					? `Metadata - ${proposals} AI ${proposals === 1 ? 'suggestion' : 'suggestions'} waiting`
					: 'Document metadata'
			}
			className={cn(
				'relative flex items-center gap-1 rounded-md px-1.5 py-1 text-xs transition-colors',
				open
					? 'bg-accent/15 text-accent'
					: 'text-subtle hover:bg-[var(--overlay-hover)] hover:text-foreground',
			)}
		>
			<ClipboardList className="h-3.5 w-3.5" />
			<span className="text-xs leading-4">Metadata</span>
			{proposals > 0 && <span className="absolute top-0.5 right-0.5 h-1.5 w-1.5 rounded-full bg-accent" />}
		</button>
	)
}

/**
 * Konteks yang sedang dipakai AI, sekilas: jenis karya dan pendekatannya.
 * Hanya tampil kalau brief memang berisi - tanda "filled by AI" di sini adalah
 * satu-satunya hal yang perlu dilirik penulis yang tidak membuka panelnya.
 */
export function BriefContextRow() {
	const { brief, openPanel } = useBrief()
	const parts = (['jenisKarya', 'pendekatan'] as const)
		.map((key) => brief.entries[key])
		.filter((entry) => entry !== undefined)
	if (parts.length === 0 && brief.proposals.length === 0) return null

	const guessed = parts.some((entry) => entry.source === 'ai')

	return (
		<button
			type="button"
			onClick={() => openPanel({ tab: 'research' })}
			title="Research context the AI reads - click to view or change"
			className="flex shrink-0 items-center gap-1.5 border-b border-line bg-surface px-4 py-1.5 text-left text-[11px] text-subtle transition-colors hover:text-foreground"
		>
			<ClipboardList className="h-3 w-3 shrink-0" />
			<span className="min-w-0 flex-1 truncate text-[11px] leading-4">
				{parts.map((entry) => entry.value).join(' · ')}
			</span>
			{guessed && (
				<span className="shrink-0 rounded-full bg-accent/10 px-1.5 text-[9px] text-accent">filled by AI</span>
			)}
			{brief.proposals.length > 0 && (
				<span className="shrink-0 rounded-full bg-accent px-1.5 text-[9px] font-semibold text-accent-foreground">
					{brief.proposals.length} {brief.proposals.length === 1 ? 'suggestion' : 'suggestions'}
				</span>
			)}
		</button>
	)
}
