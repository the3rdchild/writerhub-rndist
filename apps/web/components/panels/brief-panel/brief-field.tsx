'use client'

import type { BriefEntry, BriefFieldDef, BriefProposal } from '@writer-hub/shared'
import { Check, Lock, X } from 'lucide-react'
import { type ReactNode, useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'

export const FIELD_INPUT =
	'w-full rounded-lg border border-line bg-surface px-2.5 py-1.5 text-sm text-foreground outline-none transition-colors placeholder:text-faint focus:border-accent'

/**
 * Draf lokal yang baru diserahkan saat kehilangan fokus. Menulis ke Y.Doc di
 * setiap ketukan berarti menjadwalkan sinkronisasi server dan menggambar ulang
 * chat di setiap huruf; sebaliknya, nilai yang diubah AI saat penulis tidak
 * sedang mengetik harus langsung terlihat.
 */
export function useCommittedDraft(value: string, commit: (next: string) => void) {
	const [draft, setDraft] = useState(value)
	const focused = useRef(false)

	useEffect(
		function followOutsideChanges() {
			if (!focused.current) setDraft(value)
		},
		[value],
	)

	return {
		draft,
		setDraft,
		onFocus: () => {
			focused.current = true
		},
		onBlur: () => {
			focused.current = false
			if (draft.trim() !== value.trim()) commit(draft)
		},
	}
}

export function SourceBadge({ entry, onConfirm }: { entry: BriefEntry | undefined; onConfirm?: () => void }) {
	if (!entry || entry.source === 'user') return null

	if (entry.source === 'template') {
		return (
			<span
				title="Taken from this document's template. Change it if your university's guidelines differ."
				className="rounded-full bg-surface-inset px-1.5 py-0.5 text-[9px] font-medium text-muted"
			>
				template
			</span>
		)
	}

	return (
		<span className="flex items-center gap-1">
			<span
				title={entry.evidence ? `Diisi AI berdasarkan: “${entry.evidence}”` : 'Filled by AI'}
				className="rounded-full bg-accent/10 px-1.5 py-0.5 text-[9px] font-medium text-accent"
			>
				AI
			</span>
			{onConfirm && (
				<button
					type="button"
					onClick={onConfirm}
					title="Mark as your decision - after this the AI can only suggest changes to it"
					aria-label="Lock this field"
					className="rounded-full p-0.5 text-faint transition-colors hover:bg-[var(--overlay-hover)] hover:text-foreground"
				>
					<Lock className="h-3 w-3" />
				</button>
			)}
		</span>
	)
}

export function ProposalBox({
	proposal,
	current,
	onAccept,
	onReject,
}: {
	proposal: BriefProposal
	current?: string
	onAccept: () => void
	onReject: () => void
}) {
	return (
		<div className="flex flex-col gap-1.5 rounded-lg border border-accent/25 bg-accent/5 px-2.5 py-2">
			<p className="text-[10px] font-semibold uppercase tracking-wide text-accent">AI suggestion</p>
			{current && <p className="text-[11px] leading-snug text-faint line-through">{current}</p>}
			<p className="whitespace-pre-wrap text-xs leading-snug text-foreground">{proposal.value}</p>
			{proposal.evidence && (
				<p className="text-[11px] leading-snug text-subtle">Dasarnya: “{proposal.evidence}”</p>
			)}
			<div className="flex gap-1.5 text-[11px]">
				<button
					type="button"
					onClick={onAccept}
					className="flex items-center gap-1 rounded-full bg-green-500/15 px-2.5 py-1 text-[11px] font-medium text-green-400 transition-colors hover:bg-green-500/25"
				>
					<Check className="h-3 w-3" />
					Accept
				</button>
				<button
					type="button"
					onClick={onReject}
					className="flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] text-subtle transition-colors hover:bg-[var(--overlay-hover)] hover:text-foreground"
				>
					<X className="h-3 w-3" />
					Reject
				</button>
			</div>
		</div>
	)
}

/*
 * Ukuran huruf kontrol ditulis di WADAHNYA, bukan di tombol atau inputnya:
 * `globals.css` memberi `button, input, textarea { font: inherit }` di luar
 * layer, dan aturan tanpa layer selalu menang atas utilitas Tailwind -
 * `text-xs` di tombol tidak pernah berlaku.
 */

/** Bingkai satu isian: label, lencana asal, sorotan permintaan AI, dan usulan yang menunggu. */
export function FieldFrame({
	label,
	htmlFor,
	badge,
	highlighted,
	hint,
	children,
	footer,
}: {
	label: string
	htmlFor?: string
	badge?: ReactNode
	highlighted?: boolean
	hint?: ReactNode
	children: ReactNode
	footer?: ReactNode
}) {
	const ref = useRef<HTMLDivElement>(null)

	useEffect(
		function revealRequestedField() {
			if (highlighted) ref.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
		},
		[highlighted],
	)

	return (
		<div
			ref={ref}
			className={cn(
				'flex flex-col gap-1 rounded-xl text-sm transition-colors',
				highlighted && '-mx-2 bg-accent/5 px-2 py-2 ring-1 ring-accent/40',
			)}
		>
			<div className="flex min-h-5 items-center justify-between gap-2">
				<label htmlFor={htmlFor} className="text-xs font-medium text-muted">
					{label}
				</label>
				{badge}
			</div>
			{children}
			{hint}
			{footer}
		</div>
	)
}

export function BriefFieldInput({
	field,
	value,
	onCommit,
	id,
}: {
	field: BriefFieldDef
	value: string
	onCommit: (next: string) => void
	id: string
}) {
	if (field.input === 'choice') return <ChoiceInput field={field} value={value} onCommit={onCommit} id={id} />
	return <TextInput field={field} value={value} onCommit={onCommit} id={id} />
}

function TextInput({
	field,
	value,
	onCommit,
	id,
}: {
	field: BriefFieldDef
	value: string
	onCommit: (next: string) => void
	id: string
}) {
	const { draft, setDraft, onFocus, onBlur } = useCommittedDraft(value, onCommit)

	if (field.input === 'multiline') {
		return (
			<textarea
				id={id}
				value={draft}
				onChange={(event) => setDraft(event.target.value)}
				onFocus={onFocus}
				onBlur={onBlur}
				placeholder={field.example}
				rows={draft.length > 120 ? 4 : 2}
				className={cn(FIELD_INPUT, 'resize-y leading-snug')}
			/>
		)
	}

	return (
		<input
			id={id}
			type="text"
			inputMode={field.input === 'number' ? 'decimal' : undefined}
			value={draft}
			onChange={(event) => setDraft(event.target.value)}
			onFocus={onFocus}
			onBlur={onBlur}
			onKeyDown={(event) => {
				if (event.key === 'Enter') event.currentTarget.blur()
			}}
			placeholder={field.example}
			className={FIELD_INPUT}
		/>
	)
}

/**
 * Pilihan cepat plus "Lainnya". Nilai di luar daftar tetap sah - pedoman
 * kampus tidak menunggu daftar ini lengkap - jadi ia tampil sebagai isian
 * "Lainnya" yang sudah terbuka, bukan dibuang.
 */
function ChoiceInput({
	field,
	value,
	onCommit,
	id,
}: {
	field: BriefFieldDef
	value: string
	onCommit: (next: string) => void
	id: string
}) {
	const options = field.options ?? []
	const known = options.find((option) => option.toLowerCase() === value.trim().toLowerCase())
	const [otherOpen, setOtherOpen] = useState(false)
	const showOther = otherOpen || (value.trim() !== '' && !known)
	const { draft, setDraft, onFocus, onBlur } = useCommittedDraft(known ? '' : value, onCommit)

	return (
		<div className="flex flex-col gap-1.5">
			<fieldset className="flex min-w-0 flex-wrap gap-1 text-xs" aria-label={field.label}>
				{options.map((option) => {
					const active = option === known
					return (
						<button
							key={option}
							type="button"
							aria-pressed={active}
							onClick={() => {
								setOtherOpen(false)
								onCommit(active ? '' : option)
							}}
							className={cn(
								'rounded-full border px-2.5 py-1 text-xs transition-colors',
								active
									? 'border-accent/50 bg-accent/15 text-accent'
									: 'border-line text-muted hover:bg-[var(--overlay-hover)] hover:text-foreground',
							)}
						>
							{option}
						</button>
					)
				})}
				<button
					type="button"
					aria-pressed={showOther}
					onClick={() => setOtherOpen(true)}
					className={cn(
						'rounded-full border px-2.5 py-1 text-xs transition-colors',
						showOther
							? 'border-accent/50 bg-accent/15 text-accent'
							: 'border-dashed border-line text-subtle hover:bg-[var(--overlay-hover)] hover:text-foreground',
					)}
				>
					Other…
				</button>
			</fieldset>
			{showOther && (
				<input
					id={id}
					type="text"
					// biome-ignore lint/a11y/noAutofocus: dibuka oleh klik penulis sendiri, jadi fokus memang ke sini.
					autoFocus={otherOpen && !value}
					value={draft}
					onChange={(event) => setDraft(event.target.value)}
					onFocus={onFocus}
					onBlur={() => {
						onBlur()
						if (!draft.trim()) setOtherOpen(false)
					}}
					onKeyDown={(event) => {
						if (event.key === 'Enter') event.currentTarget.blur()
					}}
					placeholder="Write your own"
					className={FIELD_INPUT}
				/>
			)}
		</div>
	)
}
