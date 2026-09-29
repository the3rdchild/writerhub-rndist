'use client'

import {
	BRIEF_FIELDS,
	type BriefChapter,
	type BriefFieldDef,
	briefFieldVisible,
	CHAPTER_STATUSES,
	type ChapterStatus,
	chapterKey,
	chapterProposalId,
	type DocumentMetadata,
} from '@writer-hub/shared'
import {
	Check,
	ChevronDown,
	Circle,
	ListPlus,
	type LucideIcon,
	Plus,
	RefreshCw,
	Sparkles,
	Trash2,
} from 'lucide-react'
import { type ReactNode, useEffect, useRef, useState } from 'react'
import { MetadataForm, MetadataScopeNote } from '@/components/templates/metadata-form'
import { useBrief } from '@/features/brief/brief-context'
import { topLevelHeadings } from '@/features/brief/chapters'
import { useChat } from '@/features/chat/chat-context'
import type { ItemState, OutlineProgress } from '@/features/chat/outline-check'
import { useOutlineProgress } from '@/features/chat/use-outline-progress'
import { useSessions } from '@/features/sessions/session-context'
import { readTabs } from '@/features/sessions/ydoc'
import { fragmentToJSON } from '@/features/sync/serialize'
import { cn } from '@/lib/utils'
import {
	BriefFieldInput,
	FIELD_INPUT,
	FieldFrame,
	ProposalBox,
	SourceBadge,
	useCommittedDraft,
} from './brief-field'

const RESEARCH_FIELDS = BRIEF_FIELDS.filter((field) => field.tab === 'research')

/** Perintah yang dikirim ke chat oleh tombol panel - terlihat di percakapan, bukan jalan pintas tersembunyi. */
const FILL_FROM_MANUSCRIPT =
	'Isi metadata penelitian dokumen ini dari naskah yang sudah ada. Catat hanya yang benar-benar tertulis, lalu tanyakan kepada saya keputusan yang tidak bisa dipastikan.'
const REFRESH_CHAPTERS = 'Perbarui isi per bab di metadata dari naskah saat ini: ringkasan dan statusnya.'

export function BriefFieldRow({ field }: { field: BriefFieldDef }) {
	const { brief, panel, setField, confirmField, acceptProposal, rejectProposal } = useBrief()
	const entry = brief.entries[field.key]
	const proposal = brief.proposals.find((item) => item.key === field.key)
	const id = `brief-${field.key}`

	return (
		<FieldFrame
			label={field.label}
			htmlFor={id}
			badge={<SourceBadge entry={entry} onConfirm={() => confirmField(field.key)} />}
			highlighted={panel.highlight.includes(field.key)}
			hint={field.hint && <p className="text-[11px] leading-snug text-subtle">{field.hint}</p>}
			footer={
				proposal && (
					<ProposalBox
						proposal={proposal}
						current={entry?.value}
						onAccept={() => acceptProposal(proposal.id)}
						onReject={() => rejectProposal(proposal.id)}
					/>
				)
			}
		>
			<BriefFieldInput
				field={field}
				value={entry?.value ?? ''}
				onCommit={(next) => setField(field.key, next)}
				id={id}
			/>
		</FieldFrame>
	)
}

export function ResearchTab() {
	const { brief, identity } = useBrief()
	const { send, isRunning, pendingAsk } = useChat()
	const chatBusy = isRunning || pendingAsk !== null
	const filled = RESEARCH_FIELDS.some((field) => brief.entries[field.key])

	return (
		<div className="flex flex-col gap-4">
			{!filled && (
				<div className="flex flex-col gap-2 rounded-xl border border-line bg-surface-raised px-3 py-2.5 text-xs">
					<p className="text-xs leading-relaxed text-muted">
						Isi sendiri, atau biarkan AI mengisinya. AI hanya mencatat keputusan yang tertulis di naskah atau
						Anda katakan - selebihnya ia bertanya.
					</p>
					<button
						type="button"
						disabled={chatBusy}
						onClick={() => send(FILL_FROM_MANUSCRIPT)}
						className="flex items-center justify-center gap-1.5 self-start rounded-full bg-accent/15 px-3 py-1.5 text-xs font-medium text-accent transition-colors hover:bg-accent/25 disabled:cursor-not-allowed disabled:opacity-40"
					>
						<Sparkles className="h-3.5 w-3.5" />
						Isi dari naskah
					</button>
				</div>
			)}

			{RESEARCH_FIELDS.filter((field) => briefFieldVisible(field, brief)).map((field) => (
				<BriefFieldRow key={field.key} field={field} />
			))}

			<ChapterList chatBusy={chatBusy} onRefresh={() => send(REFRESH_CHAPTERS)} />

			{identity && (
				<IdentitySection
					templateName={identity.templateName}
					fields={identity.fields}
					values={identity.values}
					saving={identity.saving}
					error={identity.error}
					onSave={identity.save}
				/>
			)}
		</div>
	)
}

/**
 * Sidik jari isi bab, dihitung ulang sesudah penulis berhenti mengetik -
 * bukan di setiap ketukan: satu hitungan membaca semua tab dokumen.
 */
function useChapterPrints(): Map<string, string> {
	const { fingerprints } = useBrief()
	const { doc } = useSessions()
	const [prints, setPrints] = useState<Map<string, string>>(() => fingerprints())

	useEffect(
		function recomputeAfterEdits() {
			setPrints(fingerprints())
			let timer: ReturnType<typeof setTimeout> | undefined
			const onUpdate = () => {
				if (timer) clearTimeout(timer)
				timer = setTimeout(() => setPrints(fingerprints()), 800)
			}
			doc.on('update', onUpdate)
			return () => {
				if (timer) clearTimeout(timer)
				doc.off('update', onUpdate)
			}
		},
		[doc, fingerprints],
	)

	return prints
}

const STATUS_LABEL: Record<ChapterStatus, string> = { belum: 'Belum', draf: 'Draf', selesai: 'Selesai' }

function ChapterList({ chatBusy, onRefresh }: { chatBusy: boolean; onRefresh: () => void }) {
	const { brief, docId, setChapters, acceptProposal, rejectProposal } = useBrief()
	const { doc } = useSessions()
	const prints = useChapterPrints()
	const outline = useOutlineProgress()
	const chapters = brief.chapters

	/*
	 * Hanya ringkasan yang ditulis penulis yang menjadi miliknya. Mengganti
	 * status atau merapikan judul tidak boleh mengunci ringkasan buatan AI dari
	 * pembaruan berikutnya. Ringkasan yang ditulis sendiri juga menyegarkan
	 * sidik jarinya: penulis baru saja membaca bab itu.
	 */
	const update = (index: number, patch: Partial<BriefChapter>) =>
		setChapters(
			chapters.map((chapter, at) => {
				if (at !== index) return chapter
				const next = { ...chapter, ...patch, at: Date.now() }
				if (patch.summary === undefined) return next
				const print = prints.get(chapterKey(next.title))
				return { ...next, source: 'user' as const, ...(print ? { fingerprint: print } : {}) }
			}),
		)

	/* Judul bab diambil apa adanya dari naskah - tanpa ringkasan, supaya
	 * tidak ada kata-kata yang dikarang atas nama penulis. */
	const takeFromManuscript = () => {
		if (!docId) return
		const known = new Set(chapters.map((chapter) => chapterKey(chapter.title)))
		const found = topLevelHeadings(readTabs(doc, docId).map((tab) => fragmentToJSON(doc, tab.id)))
		const added: BriefChapter[] = found
			.filter((heading) => !known.has(chapterKey(heading.title)))
			.map((heading) => ({
				title: heading.title,
				summary: '',
				status: heading.empty ? 'belum' : 'draf',
				source: 'user',
				at: Date.now(),
			}))
		if (added.length > 0) setChapters([...chapters, ...added])
	}

	return (
		<section className="flex flex-col gap-2">
			<div className="flex items-center justify-between gap-2">
				<h3 className="text-xs font-medium text-muted">Isi per bab</h3>
				<div className="flex items-center gap-0.5">
					<IconButton icon={ListPlus} label="Ambil judul bab dari naskah" onClick={takeFromManuscript} />
					<IconButton
						icon={RefreshCw}
						label="Minta AI memperbarui ringkasan dan status tiap bab"
						onClick={onRefresh}
						disabled={chatBusy}
					/>
					<IconButton
						icon={Plus}
						label="Tambah bab"
						onClick={() =>
							setChapters([
								...chapters,
								{
									title: `Bab ${chapters.length + 1}`,
									summary: '',
									status: 'belum',
									source: 'user',
									at: Date.now(),
								},
							])
						}
					/>
				</div>
			</div>

			<OutlinePlan outline={outline} />

			{chapters.length === 0 && (
				<p className="rounded-xl border border-dashed border-line px-3 py-2.5 text-[11px] leading-relaxed text-subtle">
					Belum ada bab. Ambil judulnya dari naskah, atau minta AI meringkas tiap bab - ringkasan inilah yang
					menjaga AI tetap tahu isi bab lain saat menulis satu bab.
				</p>
			)}

			{chapters.map((chapter, index) => {
				const current = prints.get(chapterKey(chapter.title))
				const state =
					current === undefined
						? 'missing'
						: chapter.fingerprint && chapter.fingerprint !== current
							? 'stale'
							: 'fresh'
				const proposal = brief.proposals.find((item) => item.id === chapterProposalId(chapter.title))
				return (
					<ChapterCard
						// biome-ignore lint/suspicious/noArrayIndexKey: judul bab boleh kembar; draf di kartu selalu mengikuti nilainya, jadi posisi adalah identitas yang aman.
						key={`${chapterKey(chapter.title)}-${index}`}
						chapter={chapter}
						state={state}
						items={outline?.items.filter((item) => chapterKey(item.chapter) === chapterKey(chapter.title))}
						onChange={(patch) => update(index, patch)}
						onRemove={() => setChapters(chapters.filter((_, at) => at !== index))}
						footer={
							proposal && (
								<ProposalBox
									proposal={proposal}
									current={chapter.summary}
									onAccept={() => acceptProposal(proposal.id)}
									onReject={() => rejectProposal(proposal.id)}
								/>
							)
						}
					/>
				)
			})}
		</section>
	)
}

/**
 * Panjang yang diminta dan catatan riset dari kerangka (`set_outline`).
 * Catatan riset dilipat: isinya untuk AI, penulis cukup tahu ia ada.
 */
function OutlinePlan({ outline }: { outline: OutlineProgress | null }) {
	const { brief } = useBrief()
	const plan = brief.plan
	if (!plan) return null
	const pages = plan.pages
	const current = outline?.pages?.current
	const off = pages && current !== undefined && (current < pages[0] || current > pages[1])

	return (
		<div className="flex flex-col gap-1 rounded-xl border border-line bg-surface-raised px-3 py-2 text-[11px] text-muted">
			{pages && (
				<p>
					Target {pages[0] === pages[1] ? pages[0] : `${pages[0]}-${pages[1]}`} halaman
					{current !== undefined && (
						<span className={off ? 'text-yellow-400' : 'text-subtle'}> · sekarang {current}</span>
					)}
				</p>
			)}
			{plan.notes.length > 0 && (
				<details>
					<summary className="cursor-pointer text-subtle">Catatan riset ({plan.notes.length})</summary>
					<ul className="mt-1 list-disc pl-4 leading-snug">
						{plan.notes.map((note) => (
							<li key={note}>{note}</li>
						))}
					</ul>
				</details>
			)}
		</div>
	)
}

const ITEM_NOTE: Record<ItemState['state'], string> = {
	present: 'sudah ada',
	'caption-only': 'baru keterangannya',
	missing: 'belum ada',
}

function ChapterCard({
	chapter,
	state,
	items,
	onChange,
	onRemove,
	footer,
}: {
	chapter: BriefChapter
	state: 'missing' | 'stale' | 'fresh'
	/** Tabel/gambar yang dijanjikan kerangka untuk bab ini, dengan keadaannya di naskah. */
	items?: ItemState[]
	onChange: (patch: Partial<BriefChapter>) => void
	onRemove: () => void
	footer?: ReactNode
}) {
	const title = useCommittedDraft(chapter.title, (next) => {
		if (next.trim()) onChange({ title: next.trim() })
	})
	const summary = useCommittedDraft(chapter.summary, (next) => onChange({ summary: next.trim() }))

	return (
		<div className="flex flex-col gap-1.5 rounded-xl border border-line bg-surface-raised p-2.5 text-xs">
			<div className="flex items-center gap-1.5">
				<input
					aria-label="Judul bab"
					value={title.draft}
					onChange={(event) => title.setDraft(event.target.value)}
					onFocus={title.onFocus}
					onBlur={title.onBlur}
					onKeyDown={(event) => {
						if (event.key === 'Enter') event.currentTarget.blur()
					}}
					className="min-w-0 flex-1 bg-transparent text-xs font-medium text-foreground outline-none"
				/>
				<SourceBadge entry={{ value: '', source: chapter.source, at: chapter.at }} />
				<button
					type="button"
					onClick={onRemove}
					aria-label={`Hapus ${chapter.title}`}
					title="Hapus dari daftar bab (naskah tidak tersentuh)"
					className="rounded-md p-1 text-faint transition-colors hover:bg-[var(--overlay-hover)] hover:text-foreground"
				>
					<Trash2 className="h-3 w-3" />
				</button>
			</div>

			<fieldset className="flex min-w-0 gap-1 text-[10px]" aria-label={`Status ${chapter.title}`}>
				{CHAPTER_STATUSES.map((status) => (
					<button
						key={status}
						type="button"
						aria-pressed={chapter.status === status}
						onClick={() => onChange({ status })}
						className={cn(
							'rounded-full px-2 py-0.5 text-[10px] transition-colors',
							chapter.status === status
								? status === 'selesai'
									? 'bg-green-500/15 text-green-400'
									: 'bg-accent/15 text-accent'
								: 'text-subtle hover:bg-[var(--overlay-hover)] hover:text-foreground',
						)}
					>
						{STATUS_LABEL[status]}
					</button>
				))}
			</fieldset>

			<textarea
				aria-label={`Ringkasan ${chapter.title}`}
				value={summary.draft}
				onChange={(event) => summary.setDraft(event.target.value)}
				onFocus={summary.onFocus}
				onBlur={summary.onBlur}
				placeholder="Isi bab ini, singkat"
				rows={2}
				className={cn(FIELD_INPUT, 'resize-y text-xs leading-snug')}
			/>

			{items && items.length > 0 && (
				<ul
					className="flex flex-col gap-0.5 text-[11px] leading-snug"
					aria-label={`Tabel dan gambar ${chapter.title}`}
				>
					{items.map((item) => (
						<li key={item.text} className="flex items-start gap-1.5" title={item.text}>
							{item.state === 'present' ? (
								<Check className="mt-0.5 h-3 w-3 shrink-0 text-green-400" />
							) : (
								<Circle className="mt-0.5 h-3 w-3 shrink-0 text-faint" />
							)}
							<span className={item.state === 'present' ? 'text-muted' : 'text-foreground'}>
								{item.label}
								<span className="text-subtle"> · {ITEM_NOTE[item.state]}</span>
							</span>
						</li>
					))}
				</ul>
			)}
			{state === 'stale' && (
				<p className="text-[11px] leading-snug text-yellow-400">Naskah bab ini berubah sejak diringkas.</p>
			)}
			{state === 'missing' && (
				<p className="text-[11px] leading-snug text-faint">Judul ini belum ada di naskah.</p>
			)}
			{footer}
		</div>
	)
}

function IconButton({
	icon: Icon,
	label,
	onClick,
	disabled,
}: {
	icon: LucideIcon
	label: string
	onClick: () => void
	disabled?: boolean
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			disabled={disabled}
			aria-label={label}
			title={label}
			className="rounded-md p-1 text-subtle transition-colors hover:bg-[var(--overlay-hover)] hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
		>
			<Icon className="h-3.5 w-3.5" />
		</button>
	)
}

/**
 * Isian sampul dari template - nama, NIM, prodi. Disimpan eksplisit, bukan
 * saat kehilangan fokus: ia pergi ke server dan mengisi metadata yang dibaca
 * banyak pihak, jadi separuh ketikan tidak boleh ikut tersimpan.
 */
function IdentitySection({
	templateName,
	fields,
	values,
	saving,
	error,
	onSave,
}: {
	templateName: string
	fields: Parameters<typeof MetadataForm>[0]['fields']
	values: DocumentMetadata
	saving: boolean
	error: string | null
	onSave: (next: DocumentMetadata) => Promise<boolean>
}) {
	const [open, setOpen] = useState(false)
	const [draft, setDraft] = useState<DocumentMetadata>(values)
	const dirty = fields.some((field) => (draft[field.key] ?? '') !== (values[field.key] ?? ''))
	/* Dibaca lewat ref: nilai tersimpan yang berubah mengikuti draf hanya kalau
	 * penulis tidak sedang menyunting - tapi mulai menyunting sendiri tidak
	 * boleh memicu apa pun. */
	const dirtyRef = useRef(dirty)
	dirtyRef.current = dirty

	useEffect(
		function followSavedValues() {
			if (!dirtyRef.current) setDraft(values)
		},
		[values],
	)

	return (
		<section className="flex flex-col gap-2 border-t border-line pt-3 text-xs">
			<button
				type="button"
				onClick={() => setOpen(!open)}
				aria-expanded={open}
				className="flex items-center justify-between gap-2 text-left"
			>
				<span className="flex flex-col">
					<span className="text-xs font-medium text-muted">Identitas sampul</span>
					<span className="text-[10px] text-faint">{templateName}</span>
				</span>
				<ChevronDown className={cn('h-3.5 w-3.5 text-subtle transition-transform', open && 'rotate-180')} />
			</button>
			{open && (
				<>
					<MetadataScopeNote afterCreation />
					<div className="text-sm">
						<MetadataForm fields={fields} values={draft} onChange={setDraft} />
					</div>
					{error && <p className="text-[11px] text-red-400">{error}</p>}
					<button
						type="button"
						disabled={!dirty || saving}
						onClick={() => void onSave(draft)}
						className="self-end rounded-full bg-accent px-3 py-1.5 text-xs font-medium text-accent-foreground transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:bg-accent/30 disabled:text-white/50"
					>
						{saving ? 'Menyimpan…' : 'Simpan identitas'}
					</button>
				</>
			)}
		</section>
	)
}
