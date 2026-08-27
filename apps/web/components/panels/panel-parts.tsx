'use client'

import {
	AlertTriangle,
	CheckCircle2,
	Eraser,
	FileText,
	GitCompare,
	Loader2,
	type LucideIcon,
	Square,
	TextSelection,
	Undo2,
	X,
	XCircle,
} from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
export function PanelScroll({ children, className }: { children: ReactNode; className?: string }) {
	return (
		<div className={cn('flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto bg-surface-inset p-4', className)}>
			{children}
		</div>
	)
}

export function PanelFooter({ children }: { children: ReactNode }) {
	return <div className="flex shrink-0 flex-col gap-2 border-t border-line px-4 py-3">{children}</div>
}

export function StaleNotice() {
	return (
		<div className="flex items-center gap-2 rounded-xl border border-yellow-500/20 bg-yellow-500/10 px-3 py-2 text-xs text-yellow-400">
			<AlertTriangle className="h-3.5 w-3.5 shrink-0" />
			Text has changed - run again for up-to-date results
		</div>
	)
}
export function ScopeIndicator({ wordCount }: { wordCount: number | null }) {
	if (wordCount === null) {
		return (
			<div className="flex items-center gap-2 rounded-xl border border-line bg-[var(--overlay-hover)] px-3 py-2 text-xs text-subtle">
				<FileText className="h-3.5 w-3.5 shrink-0" />
				<span>Whole document</span>
			</div>
		)
	}

	return (
		<div className="flex items-center gap-2 rounded-xl border border-accent/20 bg-accent/10 px-3 py-2 text-xs text-accent">
			<TextSelection className="h-3.5 w-3.5 shrink-0" />
			<span>
				Selection · {wordCount} {wordCount === 1 ? 'word' : 'words'}
			</span>
		</div>
	)
}

export function PanelLoading({ label }: { label: string }) {
	return (
		<div className="flex flex-1 flex-col items-center justify-center gap-2 text-subtle">
			<Loader2 className="h-5 w-5 animate-spin" />
			<p className="text-sm">{label}</p>
		</div>
	)
}

export function PanelError({ message }: { message: string }) {
	return <p className="rounded-xl bg-red-400/10 px-3 py-2 text-xs text-red-400">{message}</p>
}

export function PanelEmptyState({
	icon: Icon,
	title,
	description,
}: {
	icon: LucideIcon
	title: string
	description: string
}) {
	return (
		<div className="flex flex-1 flex-col items-center justify-center gap-2 px-4 text-center">
			<Icon className="h-8 w-8 text-faint" />
			<p className="text-sm font-medium text-foreground">{title}</p>
			<p className="text-xs text-subtle">{description}</p>
		</div>
	)
}

export function RunButton({
	onClick,
	onCancel,
	disabled,
	isRunning,
	runningLabel,
	label,
	cancelLabel = 'Cancel',
}: {
	onClick: () => void
	onCancel?: () => void
	disabled: boolean
	isRunning: boolean
	runningLabel: string
	label: string
	cancelLabel?: string
}) {
	const canCancel = isRunning && onCancel
	return (
		<button
			type="button"
			onClick={canCancel ? onCancel : onClick}
			aria-label={canCancel ? cancelLabel : undefined}
			className={cn(
				'flex w-full items-center justify-center gap-2 rounded-full px-5 py-2 text-sm font-medium transition-colors',
				canCancel
					? 'border border-line-strong bg-surface-raised text-foreground hover:bg-[var(--overlay-hover)]'
					: disabled
						? 'cursor-not-allowed bg-accent/40 text-white/50'
						: 'bg-accent text-accent-foreground hover:bg-accent-hover',
			)}
		>
			{canCancel ? (
				<Square className="h-3 w-3 fill-current" />
			) : (
				isRunning && <Loader2 className="h-3.5 w-3.5 animate-spin" />
			)}
			{canCancel ? cancelLabel : isRunning ? runningLabel : label}
		</button>
	)
}

export function AcceptAllButton({ onClick, disabled }: { onClick: () => void; disabled?: boolean }) {
	return (
		<button
			type="button"
			onClick={onClick}
			disabled={disabled}
			className={cn(
				'flex w-full items-center justify-center gap-1.5 rounded-full py-2 text-sm font-medium transition-colors',
				disabled
					? 'cursor-not-allowed bg-green-500/5 text-green-400/30'
					: 'bg-green-500/15 text-green-400 hover:bg-green-500/25',
			)}
		>
			<CheckCircle2 className="h-3.5 w-3.5" />
			Accept All
		</button>
	)
}
export function ClearResultsButton({ onClick }: { onClick: () => void }) {
	return (
		<button
			type="button"
			onClick={onClick}
			className="flex w-full items-center justify-center gap-1.5 rounded-full border border-line-strong py-2 text-sm font-medium text-muted transition-colors hover:bg-surface-raised hover:text-foreground"
		>
			<Eraser className="h-3.5 w-3.5" />
			Clear results
		</button>
	)
}
export function CompareButton({
	active,
	onToggle,
	disabled,
}: {
	active: boolean
	onToggle: () => void
	disabled?: boolean
}) {
	return (
		<button
			type="button"
			onClick={onToggle}
			disabled={disabled}
			aria-pressed={active}
			title={active ? 'Hide comparison in document' : 'Preview all changes in the document'}
			className={cn(
				'flex w-full items-center justify-center gap-1.5 rounded-full border py-2 text-sm font-medium transition-colors',
				active
					? 'border-accent/40 bg-accent/15 text-accent'
					: 'border-line-strong text-muted hover:bg-surface-raised hover:text-foreground',
				disabled && 'cursor-not-allowed opacity-40',
			)}
		>
			<GitCompare className="h-3.5 w-3.5" />
			{active ? 'Hide compare' : 'Compare'}
		</button>
	)
}

export function AcceptDismissRow({
	onAccept,
	onDismiss,
	acceptDisabled,
}: {
	onAccept: () => void
	onDismiss: () => void
	acceptDisabled?: boolean
}) {
	return (
		<div className="flex gap-1.5">
			<button
				type="button"
				onClick={(event) => {
					event.stopPropagation()
					onAccept()
				}}
				disabled={acceptDisabled}
				className={cn(
					'flex flex-1 items-center justify-center gap-1 rounded-lg py-1.5 text-xs transition-colors',
					acceptDisabled
						? 'cursor-not-allowed bg-green-500/5 text-green-400/30'
						: 'bg-green-500/15 text-green-400 hover:bg-green-500/25',
				)}
			>
				<CheckCircle2 className="h-3.5 w-3.5" />
				Accept
			</button>
			<button
				type="button"
				onClick={(event) => {
					event.stopPropagation()
					onDismiss()
				}}
				className="flex flex-1 items-center justify-center gap-1 rounded-lg bg-line-strong py-1.5 text-xs text-muted transition-colors hover:bg-line-strong/70"
			>
				<X className="h-3.5 w-3.5" />
				Dismiss
			</button>
		</div>
	)
}
export function ChangeCard({
	original,
	replacement,
	onAccept,
	onDismiss,
	acceptDisabled,
	...rangeProps
}: {
	original: string
	replacement: string
	onAccept: () => void
	onDismiss: () => void
	acceptDisabled?: boolean
} & React.HTMLAttributes<HTMLDivElement>) {
	return (
		<div
			{...rangeProps}
			className="flex cursor-pointer flex-col gap-2 rounded-xl border border-line bg-surface-raised p-3 transition-colors hover:border-line-strong"
		>
			{/* Ditumpuk, bukan berdampingan, supaya kalimat panjang tetap terbaca. */}
			<div className="flex flex-col gap-1.5 text-xs leading-relaxed">
				<p className="text-red-300/70 line-through decoration-red-400/40">{original}</p>
				<p className="border-l-2 border-emerald-400/40 pl-2 text-emerald-300">{replacement}</p>
			</div>
			<AcceptDismissRow onAccept={onAccept} onDismiss={onDismiss} acceptDisabled={acceptDisabled} />
		</div>
	)
}
export function CandidateCard({
	original,
	candidates,
	previewIndex,
	onPreview,
	onClearPreview,
	onApply,
	onDismiss,
	...rangeProps
}: {
	original: string
	candidates: readonly string[]
	previewIndex: number | null
	onPreview: (index: number) => void
	onClearPreview: () => void
	onApply: (index: number) => void
	onDismiss: () => void
} & React.HTMLAttributes<HTMLDivElement>) {
	return (
		<div
			{...rangeProps}
			className="flex flex-col gap-2 rounded-xl border border-line bg-surface-raised p-3 transition-colors hover:border-line-strong"
		>
			<p className="text-xs leading-relaxed text-red-300/70 line-through decoration-red-400/40">{original}</p>

			<div className="flex flex-col gap-1.5">
				{candidates.map((candidate, index) => (
					<div
						key={candidate}
						onMouseEnter={() => onPreview(index)}
						onMouseLeave={onClearPreview}
						className={cn(
							'flex flex-col gap-1.5 rounded-lg border p-2 transition-colors',
							previewIndex === index
								? 'border-emerald-400/60 bg-emerald-500/10'
								: 'border-line hover:border-line-strong',
						)}
					>
						<div className="flex items-start gap-2">
							<span className="mt-0.5 shrink-0 rounded bg-[var(--overlay-active)] px-1.5 py-0.5 text-[10px] font-medium text-subtle">
								{index + 1}
							</span>
							<p className="flex-1 text-xs leading-relaxed text-emerald-300">{candidate}</p>
						</div>
						<button
							type="button"
							onClick={(event) => {
								event.stopPropagation()
								onApply(index)
							}}
							className="flex items-center justify-center gap-1 rounded-lg bg-green-500/15 py-1 text-xs text-green-400 transition-colors hover:bg-green-500/25"
						>
							<CheckCircle2 className="h-3.5 w-3.5" />
							Apply
						</button>
					</div>
				))}
			</div>

			<button
				type="button"
				onClick={(event) => {
					event.stopPropagation()
					onDismiss()
				}}
				className="flex items-center justify-center gap-1 rounded-lg bg-[var(--overlay-hover)] py-1.5 text-xs text-muted transition-colors hover:text-foreground"
			>
				<XCircle className="h-3.5 w-3.5" />
				Skip this segment
			</button>
		</div>
	)
}
export function AppliedCard({
	original,
	applied,
	canRevert,
	onRevert,
}: {
	original: string
	applied: string
	canRevert: boolean
	onRevert: () => void
}) {
	return (
		<div className="flex flex-col gap-2 rounded-xl border border-emerald-400/30 bg-emerald-500/5 p-3">
			<div className="flex items-center gap-1.5 text-[11px] font-medium text-emerald-400">
				<CheckCircle2 className="h-3.5 w-3.5" />
				Applied
			</div>
			<p className="text-xs leading-relaxed text-emerald-300">{applied}</p>
			<p className="text-[11px] leading-relaxed text-subtle line-through">{original}</p>
			<button
				type="button"
				onClick={onRevert}
				disabled={!canRevert}
				title={canRevert ? 'Revert to original text' : undefined}
				className={cn(
					'flex items-center justify-center gap-1 rounded-lg py-1.5 text-xs transition-colors',
					canRevert
						? 'bg-[var(--overlay-hover)] text-muted hover:text-foreground'
						: 'cursor-not-allowed bg-[var(--overlay-hover)] text-faint',
				)}
			>
				<Undo2 className="h-3.5 w-3.5" />
				{canRevert ? 'Undo' : 'Text has changed'}
			</button>
		</div>
	)
}
