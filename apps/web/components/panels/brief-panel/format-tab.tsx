'use client'

import {
	BRIEF_FIELDS,
	type BriefKey,
	briefField,
	type DocumentTypography,
	type PageSetup,
} from '@writer-hub/shared'
import { AlertTriangle, CheckCircle2, Undo2, Wand2 } from 'lucide-react'
import { useState } from 'react'
import { useBrief } from '@/features/brief/brief-context'
import {
	applyFormatTarget,
	formatDifferences,
	formatTarget,
	formatTargetIsEmpty,
} from '@/features/brief/format-apply'
import { usePageSetup } from '@/features/editor/use-page-setup'
import { useTypography } from '@/features/editor/use-typography'
import { cn } from '@/lib/utils'
import { FIELD_INPUT, FieldFrame, ProposalBox, SourceBadge, useCommittedDraft } from './brief-field'
import { BriefFieldRow } from './research-tab'

const MARGINS: readonly BriefKey[] = ['marginKiri', 'marginAtas', 'marginKanan', 'marginBawah']
const FORMAT_FIELDS = BRIEF_FIELDS.filter((field) => field.tab === 'format')

export function FormatTab() {
	return (
		<div className="flex flex-col gap-4">
			<p className="text-[11px] leading-relaxed text-subtle">
				Aturan dari pedoman kampus Anda. AI mengikutinya saat menulis, dan bila berbeda dengan template,
				aturan di sini yang menang.
			</p>
			<Compliance />
			{FORMAT_FIELDS.map((field) => {
				if (field.key === 'marginKiri') return <MarginRow key="margins" />
				if (MARGINS.includes(field.key)) return null
				return <BriefFieldRow key={field.key} field={field} />
			})}
		</div>
	)
}

/** Empat margin dalam satu baris - begitulah pedoman menuliskannya: "4-3-3-3". */
function MarginRow() {
	const { brief, panel, setField, confirmField, acceptProposal, rejectProposal } = useBrief()
	const proposals = brief.proposals.filter((proposal) => proposal.key && MARGINS.includes(proposal.key))
	const fromAi = MARGINS.map((key) => brief.entries[key]).find((entry) => entry && entry.source !== 'user')

	return (
		<FieldFrame
			label="Margin (cm)"
			badge={
				<SourceBadge
					entry={fromAi}
					onConfirm={() => {
						for (const key of MARGINS) confirmField(key)
					}}
				/>
			}
			highlighted={MARGINS.some((key) => panel.highlight.includes(key))}
			footer={proposals.map((proposal) => (
				<ProposalBox
					key={proposal.id}
					proposal={{ ...proposal, value: `${briefField(proposal.key ?? '')?.label}: ${proposal.value} cm` }}
					current={proposal.key ? brief.entries[proposal.key]?.value : undefined}
					onAccept={() => acceptProposal(proposal.id)}
					onReject={() => rejectProposal(proposal.id)}
				/>
			))}
		>
			<div className="grid grid-cols-4 gap-1.5">
				{MARGINS.map((key) => (
					<MarginInput
						key={key}
						label={briefField(key)?.label ?? key}
						value={brief.entries[key]?.value ?? ''}
						onCommit={(next) => setField(key, next)}
					/>
				))}
			</div>
		</FieldFrame>
	)
}

function MarginInput({
	label,
	value,
	onCommit,
}: {
	label: string
	value: string
	onCommit: (next: string) => void
}) {
	const { draft, setDraft, onFocus, onBlur } = useCommittedDraft(value, onCommit)
	return (
		<label className="flex flex-col gap-0.5">
			<span className="text-[10px] text-faint">{label}</span>
			<input
				type="text"
				inputMode="decimal"
				value={draft}
				onChange={(event) => setDraft(event.target.value)}
				onFocus={onFocus}
				onBlur={onBlur}
				onKeyDown={(event) => {
					if (event.key === 'Enter') event.currentTarget.blur()
				}}
				placeholder="-"
				className={cn(FIELD_INPUT, 'px-2 text-center')}
			/>
		</label>
	)
}

/**
 * Apakah naskah sudah mengikuti aturan yang bisa diterapkan mesin, dan
 * tombol untuk membuatnya begitu. Diterapkan ke seluruh dokumen - aturan
 * kampus tidak berhenti di satu tab.
 *
 * Tata letak hidup di meta dokumen, bukan di riwayat suntingan editor, jadi
 * Ctrl+Z tidak menjangkaunya. Pembatalannya karena itu dipegang di sini.
 */
function Compliance() {
	const { brief } = useBrief()
	const { setup, setPageSetup } = usePageSetup()
	const { typography, setTypography } = useTypography()
	const [previous, setPrevious] = useState<{ setup: PageSetup; typography: DocumentTypography } | null>(null)
	const target = formatTarget(brief)

	const undo = previous && (
		<button
			type="button"
			onClick={() => {
				setPageSetup(previous.setup, 'document')
				setTypography(previous.typography, 'document')
				setPrevious(null)
			}}
			className="flex items-center gap-1 self-start rounded-full px-2 py-1 text-[11px] text-subtle transition-colors hover:bg-[var(--overlay-hover)] hover:text-foreground"
		>
			<Undo2 className="h-3 w-3" />
			Batalkan penerapan
		</button>
	)

	if (formatTargetIsEmpty(target)) {
		return (
			<p className="rounded-xl border border-dashed border-line px-3 py-2.5 text-[11px] leading-relaxed text-subtle">
				Isi kertas, margin, huruf, atau spasi untuk memeriksa apakah naskah sudah mengikutinya.
			</p>
		)
	}

	const differences = formatDifferences(target, setup, typography)
	if (differences.length === 0) {
		return (
			<div className="flex flex-col gap-1 rounded-xl border border-green-500/20 bg-green-500/10 px-3 py-2.5 text-[11px]">
				<p className="flex items-start gap-2 text-xs text-green-400">
					<CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
					<span>
						Naskah sudah mengikuti aturan ini.
						<span className="block text-[11px] text-green-400/70">
							Gaya sitasi, penomoran bab, dan bahasa diikuti AI saat menulis.
						</span>
					</span>
				</p>
				{undo}
			</div>
		)
	}

	const apply = () => {
		const next = applyFormatTarget(target, setup, typography)
		setPrevious({ setup, typography })
		setPageSetup(next.setup, 'document')
		setTypography(next.typography, 'document')
	}

	return (
		<div className="flex flex-col gap-2 rounded-xl border border-yellow-500/20 bg-yellow-500/10 px-3 py-2.5 text-xs">
			<p className="flex items-center gap-1.5 text-xs font-medium text-yellow-400">
				<AlertTriangle className="h-3.5 w-3.5 shrink-0" />
				Naskah belum mengikuti aturan ini
			</p>
			<ul className="flex flex-col gap-0.5">
				{differences.map((difference) => (
					<li key={difference.key} className="flex justify-between gap-2 text-[11px] text-muted">
						<span>{difference.label}</span>
						<span className="text-right">
							<span className="text-faint line-through">{difference.current}</span>
							{' → '}
							<span className="text-foreground">{difference.wanted}</span>
						</span>
					</li>
				))}
			</ul>
			<button
				type="button"
				onClick={apply}
				className="flex items-center justify-center gap-1.5 rounded-full bg-accent px-3 py-1.5 text-xs font-medium text-accent-foreground transition-colors hover:bg-accent-hover"
			>
				<Wand2 className="h-3.5 w-3.5" />
				Terapkan ke naskah
			</button>
			<p className="text-[10px] leading-snug text-subtle">Berlaku untuk semua tab dokumen ini.</p>
			{undo}
		</div>
	)
}
