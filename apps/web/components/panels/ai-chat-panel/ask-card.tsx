'use client'

import { briefField, type ToolCall } from '@writer-hub/shared'
import { Check, CircleHelp, ClipboardList, CornerDownLeft } from 'lucide-react'
import { type KeyboardEvent, type ReactNode, useEffect, useMemo, useRef, useState } from 'react'
import { useBrief } from '@/features/brief/brief-context'
import {
	type AskQuestion,
	parseAskQuestions,
	requestedBriefFields,
	requestMessage,
} from '@/features/chat/ask'
import { useChat } from '@/features/chat/chat-context'
import { cn } from '@/lib/utils'

/**
 * Pertanyaan AI, menggantikan kotak chat sampai dijawab atau dilewati.
 *
 * Menggantikan - bukan menumpang di percakapan - karena giliran model memang
 * berhenti di sini: pesan baru yang diketik sambil pertanyaannya menggantung
 * akan memulai tugas lain dan membuang pertanyaan itu diam-diam.
 */
export function AskCard({ call }: { call: ToolCall }) {
	return call.name === 'request_brief' ? <BriefRequestCard call={call} /> : <QuestionCard call={call} />
}

function CardShell({ title, children }: { title: string; children: ReactNode }) {
	return (
		<div className="flex flex-col gap-2.5 rounded-2xl border border-accent/30 bg-surface-raised p-3 text-xs shadow-sm">
			<p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-accent">
				<CircleHelp className="h-3.5 w-3.5" />
				{title}
			</p>
			{children}
		</div>
	)
}

function FooterButton({
	onClick,
	disabled,
	primary,
	children,
}: {
	onClick: () => void
	disabled?: boolean
	primary?: boolean
	children: ReactNode
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			disabled={disabled}
			className={cn(
				'flex items-center gap-1 rounded-full px-3 py-1.5 text-xs transition-colors disabled:cursor-not-allowed',
				primary
					? 'bg-accent font-medium text-accent-foreground hover:bg-accent-hover disabled:bg-accent/30 disabled:text-white/50'
					: 'text-subtle hover:bg-[var(--overlay-hover)] hover:text-foreground disabled:opacity-40',
			)}
		>
			{children}
		</button>
	)
}

interface Draft {
	choices: string[]
	otherOn: boolean
	other: string
}

const EMPTY_DRAFT: Draft = { choices: [], otherOn: false, other: '' }

const answered = (draft: Draft): boolean =>
	draft.choices.length > 0 || (draft.otherOn && draft.other.trim() !== '')

function QuestionCard({ call }: { call: ToolCall }) {
	const { answerAsk } = useChat()
	const questions = useMemo(() => parseAskQuestions(call.arguments), [call.arguments])
	const [index, setIndex] = useState(0)
	const [drafts, setDrafts] = useState<Draft[]>(() => questions.map(() => EMPTY_DRAFT))
	const cardRef = useRef<HTMLDivElement>(null)

	useEffect(function focusCardForShortcuts() {
		cardRef.current?.focus()
	}, [])

	const skip = () => answerAsk(call, { skipped: true })

	// Argumen yang tidak bisa dibaca tidak boleh meninggalkan penulis tanpa kotak chat.
	if (questions.length === 0) {
		return (
			<CardShell title="AI question">
				<p className="text-xs text-muted">The AI sent a question that couldn't be read.</p>
				<div className="flex justify-end">
					<FooterButton onClick={skip} primary>
						Continue without answering
					</FooterButton>
				</div>
			</CardShell>
		)
	}

	const question = questions[index]
	const draft = drafts[index] ?? EMPTY_DRAFT
	const last = index === questions.length - 1
	const anyAnswered = drafts.some(answered)

	const setDraft = (next: Draft) =>
		setDrafts((current) => current.map((item, at) => (at === index ? next : item)))

	const submit = () =>
		answerAsk(call, {
			responses: questions.map((item, at) => {
				const entry = drafts[at] ?? EMPTY_DRAFT
				const other = entry.otherOn ? entry.other.trim() : ''
				return { question: item.question, choices: entry.choices, ...(other ? { other } : {}) }
			}),
		})

	const next = () => (last ? submit() : setIndex(index + 1))

	const pick = (label: string) => {
		if (question.multiSelect) {
			const choices = draft.choices.includes(label)
				? draft.choices.filter((choice) => choice !== label)
				: [...draft.choices, label]
			setDraft({ ...draft, choices })
			return
		}
		setDraft({ choices: [label], otherOn: false, other: '' })
		// Satu pilihan berarti pertanyaan ini selesai - langsung ke berikutnya.
		if (!last) setIndex(index + 1)
	}

	const toggleOther = () =>
		setDraft(
			question.multiSelect
				? { ...draft, otherOn: !draft.otherOn }
				: { choices: [], otherOn: true, other: draft.other },
		)

	const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
		if (event.target instanceof HTMLInputElement) return
		const digit = Number(event.key)
		if (Number.isInteger(digit) && digit >= 1) {
			if (digit <= question.options.length) pick(question.options[digit - 1].label)
			else if (digit === question.options.length + 1) toggleOther()
			event.preventDefault()
			return
		}
		if (event.key === 'Enter' && answered(draft)) {
			event.preventDefault()
			next()
		}
	}

	return (
		// biome-ignore lint/a11y/noStaticElementInteractions: wadah pintasan angka untuk pilihan di dalamnya; tiap pilihan tetap tombol sungguhan.
		<div ref={cardRef} tabIndex={-1} onKeyDown={onKeyDown} className="outline-none">
			<CardShell
				title={questions.length > 1 ? `Pertanyaan AI · ${index + 1}/${questions.length}` : 'AI question'}
			>
				{questions.length > 1 && (
					<div className="flex flex-wrap gap-1 text-[11px]" role="tablist" aria-label="Questions">
						{questions.map((item, at) => (
							<button
								// biome-ignore lint/suspicious/noArrayIndexKey: daftar pertanyaan tidak pernah berubah urutan selama kartunya hidup, dan judulnya boleh kembar.
								key={at}
								type="button"
								role="tab"
								aria-selected={at === index}
								onClick={() => setIndex(at)}
								className={cn(
									'flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] transition-colors',
									at === index
										? 'bg-accent/15 text-accent'
										: 'text-subtle hover:bg-[var(--overlay-hover)] hover:text-foreground',
								)}
							>
								{answered(drafts[at] ?? EMPTY_DRAFT) && <Check className="h-3 w-3" />}
								{item.header}
							</button>
						))}
					</div>
				)}

				<QuestionBody
					question={question}
					draft={draft}
					onPick={pick}
					onToggleOther={toggleOther}
					onOther={(other) => setDraft({ ...draft, other })}
					onSubmitOther={() => answered(draft) && next()}
				/>

				<div className="flex items-center justify-between gap-2">
					<FooterButton onClick={skip}>Skip</FooterButton>
					<div className="flex items-center gap-1">
						{index > 0 && <FooterButton onClick={() => setIndex(index - 1)}>Back</FooterButton>}
						{last ? (
							<FooterButton onClick={submit} disabled={!anyAnswered} primary>
								Send
								<CornerDownLeft className="h-3 w-3" />
							</FooterButton>
						) : (
							<FooterButton onClick={next} primary>
								Next
							</FooterButton>
						)}
					</div>
				</div>
			</CardShell>
		</div>
	)
}

function QuestionBody({
	question,
	draft,
	onPick,
	onToggleOther,
	onOther,
	onSubmitOther,
}: {
	question: AskQuestion
	draft: Draft
	onPick: (label: string) => void
	onToggleOther: () => void
	onOther: (value: string) => void
	onSubmitOther: () => void
}) {
	return (
		<div className="flex flex-col gap-1.5">
			<p className="text-sm font-medium leading-snug text-foreground">{question.question}</p>
			{question.multiSelect && <p className="text-[11px] text-subtle">You can pick more than one.</p>}
			<fieldset className="flex min-w-0 flex-col gap-1" aria-label={question.question}>
				{question.options.map((option, at) => {
					const active = draft.choices.includes(option.label)
					return (
						<button
							key={option.label}
							type="button"
							aria-pressed={active}
							onClick={() => onPick(option.label)}
							className={cn(
								'flex items-start gap-2 rounded-xl border px-2.5 py-1.5 text-left transition-colors',
								active ? 'border-accent/50 bg-accent/10' : 'border-line hover:bg-[var(--overlay-hover)]',
							)}
						>
							<span
								className={cn(
									'mt-px flex h-4 w-4 shrink-0 items-center justify-center rounded text-[10px] font-semibold',
									active ? 'bg-accent text-accent-foreground' : 'bg-surface-inset text-subtle',
								)}
							>
								{active && question.multiSelect ? <Check className="h-3 w-3" /> : at + 1}
							</span>
							<span className="flex min-w-0 flex-col">
								<span className="text-xs text-foreground">{option.label}</span>
								{option.description && (
									<span className="text-[11px] leading-snug text-subtle">{option.description}</span>
								)}
							</span>
						</button>
					)
				})}

				<button
					type="button"
					aria-pressed={draft.otherOn}
					onClick={onToggleOther}
					className={cn(
						'flex items-center gap-2 rounded-xl border border-dashed px-2.5 py-1.5 text-left transition-colors',
						draft.otherOn ? 'border-accent/50 bg-accent/10' : 'border-line hover:bg-[var(--overlay-hover)]',
					)}
				>
					<span className="flex h-4 w-4 shrink-0 items-center justify-center rounded bg-surface-inset text-[10px] font-semibold text-subtle">
						{question.options.length + 1}
					</span>
					<span className="text-xs text-muted">
						{question.options.length === 0 ? 'Write your answer' : 'Other - write your own'}
					</span>
				</button>
				{(draft.otherOn || question.options.length === 0) && (
					<div className="text-sm">
						<input
							// biome-ignore lint/a11y/noAutofocus: muncul karena penulis sendiri memilih menulis jawabannya.
							autoFocus
							value={draft.other}
							onFocus={() => !draft.otherOn && onToggleOther()}
							onChange={(event) => onOther(event.target.value)}
							onKeyDown={(event) => {
								if (event.key === 'Enter') {
									event.preventDefault()
									onSubmitOther()
								}
							}}
							placeholder="Your answer"
							aria-label="Your own answer"
							className="w-full rounded-lg border border-line bg-surface px-2.5 py-1.5 text-foreground outline-none placeholder:text-faint focus:border-accent"
						/>
					</div>
				)}
			</fieldset>
		</div>
	)
}

/**
 * `request_brief`: isiannya ada di panel Metadata, kartu ini hanya memberi
 * tahu apa yang diminta dan menyerahkan giliran kembali saat penulis selesai.
 */
function BriefRequestCard({ call }: { call: ToolCall }) {
	const { answerAsk } = useChat()
	const { brief, panel, openPanel } = useBrief()
	const keys = useMemo(() => requestedBriefFields(call.arguments), [call.arguments])
	const message = requestMessage(call.arguments)
	const visible = panel.open && !panel.minimized

	return (
		<CardShell title="The AI is asking for metadata">
			{message && <p className="text-sm leading-snug text-foreground">{message}</p>}
			<ul className="flex flex-col gap-0.5">
				{keys.map((key) => (
					<li key={key} className="flex items-center gap-1.5 text-xs">
						{brief.entries[key] ? (
							<Check className="h-3.5 w-3.5 text-green-400" />
						) : (
							<span className="h-3.5 w-3.5 rounded-full border border-line-strong" />
						)}
						<span className={brief.entries[key] ? 'text-muted' : 'text-foreground'}>
							{briefField(key)?.label ?? key}
						</span>
					</li>
				))}
			</ul>
			<div className="flex items-center justify-between gap-2">
				<FooterButton onClick={() => answerAsk(call, { skipped: true })}>Skip</FooterButton>
				<div className="flex items-center gap-1">
					{!visible && (
						<FooterButton onClick={() => openPanel({ highlight: keys, ...(message ? { message } : {}) })}>
							<ClipboardList className="h-3 w-3" />
							Open panel
						</FooterButton>
					)}
					<FooterButton onClick={() => answerAsk(call, {})} primary>
						Done, continue
					</FooterButton>
				</div>
			</div>
		</CardShell>
	)
}
