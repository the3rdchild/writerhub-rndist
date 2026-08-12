'use client'

import {
	ArrowUp,
	Ban,
	Check,
	ChevronDown,
	ChevronRight,
	FileText,
	Loader2,
	Plus,
	Square,
	Trash2,
	SkipForward,
	TriangleAlert,
	Wand2,
	X,
	Zap,
} from 'lucide-react'
import { Fragment, useEffect, useRef, useState } from 'react'
import type { ChatUsage, ToolCall } from '@writer-hub/shared'
import { type ChatStep, extractProposals, stripProposals, useChat } from '@/features/chat/chat-context'
import { describeToolCall } from '@/features/chat/tools'
import { replaceTextRange } from '@/features/editor/apply-text'
import { useEditorInstance } from '@/features/editor/editor-context'
import { looksLikeMarkdown, markdownToHtml, toEditorContent } from '@/features/editor/markdown'
import { useSelectionScope } from '@/features/editor/selection'
import { cn } from '@/lib/utils'
import { PanelError } from './panel-parts'

/**
 * Percakapan tentang naskah yang sedang dibuka.
 *
 * Berbeda dari modul lain yang menjalankan satu analisis atas seluruh dokumen,
 * panel ini bergiliran: pengguna bertanya, jawabannya mengalir masuk. Usulan
 * teks datang sebagai kartu ber-Apply - idiom yang sama dengan kartu saran di
 * modul lain, supaya tidak ada suntingan yang terjadi tanpa dilihat.
 */
export function AiChatPanel() {
	const {
		messages,
		streaming,
		steps,
		isRunning,
		error,
		attachment,
		attach,
		clearAttachment,
		includeDocument,
		setIncludeDocument,
		send,
		stop,
		reset,
		startNewTopic,
		currentTaskId,
		autoApply,
		setAutoApply,
	} = useChat()

	const [draft, setDraft] = useState('')
	const scrollRef = useRef<HTMLDivElement>(null)

	/*
	 * Seleksi yang sedang aktif menempel sendiri, sama seperti panel lain yang
	 * mengarahkan Run-nya ke potongan terpilih.
	 *
	 * Yang sudah dilepas pengguna diingat supaya tidak langsung menempel lagi -
	 * tanpa itu tombol × tidak akan pernah berhasil selama seleksinya masih ada.
	 */
	const scope = useSelectionScope()
	const dismissedRef = useRef<string | null>(null)
	const selectionKey = scope ? `${scope.offset}:${scope.length}` : null

	useEffect(() => {
		if (!scope || selectionKey === null || dismissedRef.current === selectionKey) return
		attach({
			text: scope.text,
			surrounding: scope.surrounding,
			offset: scope.offset,
			length: scope.length,
		})
	}, [scope, selectionKey, attach])

	const dismissAttachment = () => {
		dismissedRef.current = selectionKey
		clearAttachment()
	}

	// Jawaban yang mengalir harus tetap terlihat tanpa pengguna menggulung.
	useEffect(() => {
		const element = scrollRef.current
		if (element) element.scrollTop = element.scrollHeight
	}, [messages, streaming, steps])

	const submit = () => {
		if (!draft.trim() || isRunning) return
		send(draft)
		setDraft('')
	}

	const isEmpty = messages.length === 0 && streaming === null

	return (
		<>
			<div ref={scrollRef} className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto bg-surface-inset p-4">
				{isEmpty && (
					<div className="flex flex-1 flex-col items-center justify-center gap-1 px-4 text-center">
						<p className="text-sm font-medium text-foreground">Ask about your draft</p>
						<p className="text-xs text-subtle">
							Select a passage and send it here, or just ask a question
						</p>
					</div>
				)}

				{messages.map((message, index) => {
					// Pesan `tool` adalah percakapan internal antara AI dan editor -
					// pengguna melihat hasilnya, bukan transkrip mekanismenya.
					if (message.role === 'tool') return null
					// Idem giliran asisten yang isinya cuma permintaan alat baca: ia ada
					// di riwayat karena protokol provider menuntutnya, bukan karena ada
					// yang perlu dibaca. Lini masa langkah sudah menceritakannya.
					if (message.intermediate) return null

					const prev = messages[index - 1]
					const newTaskBoundary = index > 0 && message.taskId !== prev?.taskId

					return (
						<Fragment key={`${index}-${message.content.slice(0, 24)}`}>
							{newTaskBoundary && <TaskSeparator />}
							<Bubble
								role={message.role}
								content={message.content}
								actions={message.actions}
								steps={message.steps}
								usage={message.usage}
								expired={!!message.taskId && message.taskId !== currentTaskId}
							/>
						</Fragment>
					)
				})}

				{streaming !== null && (
					<>
						{/* Lini masa langkah (§B1): proses yang sedang berjalan terlihat
						    sebelum jawaban muncul. */}
						{steps.length > 0 && <StepTimeline steps={steps} live />}
						<Bubble role="assistant" content={streaming} pending />
					</>
				)}

				{error && <PanelError message={error} />}
			</div>

			<div className="flex shrink-0 flex-col gap-2 px-4 py-3">
				{attachment && (
					<div className="flex items-start gap-2 rounded-xl bg-[var(--overlay-hover)] px-3 py-2">
						<span className="mt-0.5 shrink-0 text-[10px] font-semibold uppercase tracking-wide text-accent">
							Selection
						</span>
						<p className="min-w-0 flex-1 line-clamp-2 text-xs leading-relaxed text-muted">
							{attachment.text}
						</p>
						<button
							type="button"
							onClick={dismissAttachment}
							aria-label="Remove selection"
							className="shrink-0 text-subtle transition-colors hover:text-foreground"
						>
							<X className="h-3.5 w-3.5" />
						</button>
					</div>
				)}

				<div className="flex items-center gap-2">
					<button
						type="button"
						onClick={() => setIncludeDocument(!includeDocument)}
						title="Kirim teks penuh tab aktif (bawaan: ringkasan kerangka saja)"
						className={cn(
							'flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] transition-colors',
							includeDocument
								? 'bg-accent/15 text-accent'
								: 'text-subtle hover:bg-[var(--overlay-hover)] hover:text-foreground',
						)}
					>
						<FileText className="h-3 w-3" />
						Whole document
					</button>

					{/*
					 * Terapkan-otomatis melewati kartu aksi sepenuhnya. Saklarnya duduk
					 * di sini, bukan di Setelan, karena ia mengubah cara panel ini
					 * bekerja dan pengguna perlu melihat keadaannya saat memutuskan.
					 */}
					<button
						type="button"
						onClick={() => setAutoApply(!autoApply)}
						title={
							autoApply
								? 'Suntingan AI langsung masuk naskah - batalkan dengan Ctrl+Z'
								: 'Terapkan suntingan AI tanpa menunggu Apply'
						}
						aria-pressed={autoApply}
						className={cn(
							'flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] transition-colors',
							autoApply
								? 'bg-accent/15 text-accent'
								: 'text-subtle hover:bg-[var(--overlay-hover)] hover:text-foreground',
						)}
					>
						<Zap className="h-3 w-3" />
						Auto-apply
					</button>

					{messages.length > 0 && (
						<>
							<button
								type="button"
								onClick={startNewTopic}
								title="Mulai topik baru (kartu aksi lama kedaluwarsa)"
								aria-label="Mulai topik baru"
								className="ml-auto rounded-md p-1 text-subtle transition-colors hover:text-foreground"
							>
								<Plus className="h-3.5 w-3.5" />
							</button>
							<button
								type="button"
								onClick={reset}
								title="Clear conversation"
								aria-label="Clear conversation"
								className="rounded-md p-1 text-subtle transition-colors hover:text-foreground"
							>
								<Trash2 className="h-3.5 w-3.5" />
							</button>
						</>
					)}
				</div>

				<div className="flex items-end gap-2 rounded-2xl bg-surface-raised p-2">
					<textarea
						value={draft}
						onChange={(event) => setDraft(event.target.value)}
						onKeyDown={(event) => {
							// Enter mengirim; Shift+Enter untuk baris baru, seperti kotak
							// pesan pada umumnya.
							if (event.key === 'Enter' && !event.shiftKey) {
								event.preventDefault()
								submit()
							}
						}}
						rows={2}
						placeholder="Ask anything about this draft…"
						aria-label="Message"
						className="min-h-0 flex-1 resize-none bg-transparent px-2 py-1 text-sm text-foreground outline-none placeholder:text-faint"
					/>

					{isRunning ? (
						<button
							type="button"
							onClick={stop}
							aria-label="Stop"
							title="Stop"
							className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--overlay-active)] text-foreground"
						>
							<Square className="h-3.5 w-3.5" />
						</button>
					) : (
						<button
							type="button"
							onClick={submit}
							disabled={!draft.trim()}
							aria-label="Send"
							title="Send"
							className={cn(
								'flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors',
								draft.trim()
									? 'bg-accent text-accent-foreground hover:bg-accent-hover'
									: 'cursor-not-allowed bg-accent/30 text-white/50',
							)}
						>
							<ArrowUp className="h-4 w-4" />
						</button>
					)}
				</div>
			</div>
		</>
	)
}

function Bubble({
	role,
	content,
	pending,
	actions,
	steps,
	usage,
	expired,
}: {
	role: 'user' | 'assistant'
	content: string
	pending?: boolean
	actions?: ToolCall[]
	/** Lini masa langkah giliran ini (§B1); diringkas jadi satu baris. */
	steps?: ChatStep[]
	usage?: ChatUsage
	/** Asal dari tugas sebelumnya: kartu aksanya butuh konfirmasi tambahan. */
	expired?: boolean
}) {
	const proposals = role === 'assistant' ? extractProposals(content) : []
	const prose = role === 'assistant' ? stripProposals(content) : content

	if (role === 'user') {
		return (
			<div className="self-end rounded-2xl rounded-br-sm bg-accent px-3 py-2 text-sm text-accent-foreground max-w-[85%]">
				<p className="whitespace-pre-wrap break-words">{content}</p>
			</div>
		)
	}

	// Giliran terminal yang kosong (M6): tampilkan penanda, bukan bubble hilang.
	const emptyMarker =
		!pending && !prose && proposals.length === 0 && !(actions && actions.length > 0)

	return (
		<div className="flex flex-col gap-2">
			{/* Giliran selesai: lini masa menciut jadi ringkasan satu baris (§B1.3). */}
			{steps && steps.length > 0 && <StepSummary steps={steps} usage={usage} />}

			{prose &&
				(looksLikeMarkdown(prose) ? (
					/*
					 * Model menjawab dalam Markdown - render sebagai HTML, bukan teks
					 * mentah penuh `**` dan `###`. markdownToHtml meng-escape HTML
					 * bawaan, jadi aman untuk dangerouslySetInnerHTML.
					 */
					<div className="chat-md text-sm leading-relaxed text-foreground">
						<div dangerouslySetInnerHTML={{ __html: markdownToHtml(prose) }} />
						{pending && <span className="animate-pulse text-accent">▍</span>}
					</div>
				) : (
					<p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground">
						{prose}
						{pending && <span className="ml-0.5 animate-pulse text-accent">▍</span>}
					</p>
				))}

			{emptyMarker && <p className="text-xs italic text-subtle">Tidak ada jawaban.</p>}

			{/* Selama masih mengalir, blok usulan belum tentu utuh - tombol Apply
			    baru muncul setelah gilirannya selesai. */}
			{!pending &&
				proposals.map((proposal, index) => (
					<ProposalCard
						key={`${index}-${proposal.slice(0, 24)}`}
						text={proposal}
						expired={expired}
					/>
				))}

			{actions && actions.length > 0 && (
				<ActionGroup actions={actions} expired={expired} />
			)}
		</div>
	)
}

function ProposalCard({ text, expired }: { text: string; expired?: boolean }) {
	const { editor } = useEditorInstance()
	const { attachment } = useChat()
	const [applied, setApplied] = useState(false)
	const [failed, setFailed] = useState(false)
	// Kartu dari tugas sebelumnya butuh konfirmasi tambahan sebelum diterapkan.
	const [confirming, setConfirming] = useState(false)

	const apply = () => {
		if (!editor) return

		if (!attachment) {
			// Tanpa seleksi yang ditempel, tidak ada rentang yang jelas untuk
			// diganti - usulannya disisipkan di posisi kursor.
			editor.chain().focus().insertContent(toEditorContent(text)).run()
			setApplied(true)
			return
		}

		const ok = replaceTextRange(
			editor,
			{ offset: attachment.offset, length: attachment.length, expected: attachment.text },
			text,
		)
		if (ok) setApplied(true)
		else setFailed(true)
	}

	const onClick = () => {
		if (expired && !confirming) {
			setConfirming(true)
			return
		}
		apply()
	}

	return (
		<div className="flex flex-col gap-2 rounded-xl bg-surface-raised p-3">
			{looksLikeMarkdown(text) ? (
				<div
					className="chat-md text-xs leading-relaxed text-emerald-300"
					dangerouslySetInnerHTML={{ __html: markdownToHtml(text) }}
				/>
			) : (
				<p className="whitespace-pre-wrap break-words text-xs leading-relaxed text-emerald-300">{text}</p>
			)}

			{failed ? (
				<p className="text-[11px] text-yellow-400">
					Teks aslinya sudah berubah - pilih ulang bagiannya lalu coba lagi
				</p>
			) : (
				<button
					type="button"
					onClick={onClick}
					disabled={applied}
					className={cn(
						'flex items-center justify-center gap-1 rounded-lg py-1.5 text-xs transition-colors',
						applied
							? 'cursor-default bg-green-500/10 text-green-400/60'
							: expired
								? 'bg-yellow-500/15 text-yellow-400 hover:bg-yellow-500/25'
								: 'bg-green-500/15 text-green-400 hover:bg-green-500/25',
					)}
				>
					<Check className="h-3.5 w-3.5" />
					{applied ? 'Applied' : expired ? (confirming ? 'Konfirmasi?' : 'Terapkan') : 'Apply'}
				</button>
			)}
		</div>
	)
}

/**
 * Kelompok kartu aksi satu giliran.
 *
 * Keputusan atas kartu-kartu ini yang melanjutkan giliran AI, dan kelanjutan
 * itu baru berjalan setelah SEMUANYA diputuskan (lihat `settleActions`). Karena
 * itu kelompok ini punya tombol "Terapkan semua": pada pekerjaan format sepuluh
 * langkah, memutuskan satu per satu bukan kehati-hatian, hanya kerja tangan.
 */
function ActionGroup({ actions, expired }: { actions: ToolCall[]; expired?: boolean }) {
	const { applyActions, isActionSettled } = useChat()
	const pending = actions.filter((call) => !isActionSettled(call.id))

	return (
		<div className="flex flex-col gap-2">
			{pending.length > 1 && !expired && (
				<button
					type="button"
					onClick={() => applyActions(pending)}
					className="flex items-center justify-center gap-1.5 rounded-full bg-green-500/15 py-1.5 text-xs font-medium text-green-400 transition-colors hover:bg-green-500/25"
				>
					<Check className="h-3.5 w-3.5" />
					Terapkan semua ({pending.length})
				</button>
			)}
			{actions.map((call) => (
				<ActionCard key={call.id} call={call} expired={expired} />
			))}
		</div>
	)
}

/**
 * Aksi yang diminta AI, menunggu persetujuan.
 *
 * Alat tulis sengaja tidak langsung berjalan: pada naskah puluhan halaman,
 * suntingan yang tidak dilihat hampir mustahil ditelusuri kembali. Kartu ini
 * memakai idiom yang sama dengan kartu saran di modul lain.
 *
 * "Lewati" bukan sekadar kenyamanan: giliran AI baru dilanjutkan setelah setiap
 * kartu diputuskan, jadi tanpa jalan untuk menolak, satu kartu yang tak
 * diinginkan menghentikan sisa rencananya selamanya.
 */
function ActionCard({ call, expired }: { call: ToolCall; expired?: boolean }) {
	const { applyAction, skipAction, isActionApplied, isActionSettled } = useChat()
	const applied = isActionApplied(call.id)
	const settled = isActionSettled(call.id)
	const [outcome, setOutcome] = useState<{ ok: boolean; message: string } | null>(null)
	// Kartu dari tugas sebelumnya butuh satu klik konfirmasi lagi (M3).
	const [confirming, setConfirming] = useState(false)

	const onClick = () => {
		if (expired && !confirming && !applied) {
			setConfirming(true)
			return
		}
		setOutcome(applyAction(call))
	}

	return (
		<div className="flex flex-col gap-2 rounded-xl border border-accent/20 bg-accent/5 p-3">
			<div className="flex items-start gap-2">
				<Wand2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent" />
				<p className="min-w-0 flex-1 text-xs leading-relaxed text-foreground">
					{describeToolCall(call)}
				</p>
			</div>

			{expired && !settled && (
				<p className="text-[11px] italic text-subtle">Dari permintaan sebelumnya</p>
			)}

			{applied ? (
				<p className="text-[11px] text-green-400/70">Sudah diterapkan</p>
			) : outcome ? (
				<p className={cn('text-[11px]', outcome.ok ? 'text-green-400' : 'text-yellow-400')}>
					{outcome.message}
				</p>
			) : settled ? (
				<p className="text-[11px] text-subtle">Dilewati</p>
			) : (
				<div className="flex gap-1.5">
					<button
						type="button"
						onClick={onClick}
						className={cn(
							'flex flex-1 items-center justify-center gap-1 rounded-lg py-1.5 text-xs transition-colors',
							expired
								? 'bg-yellow-500/15 text-yellow-400 hover:bg-yellow-500/25'
								: 'bg-green-500/15 text-green-400 hover:bg-green-500/25',
						)}
					>
						<Check className="h-3.5 w-3.5" />
						{expired ? (confirming ? 'Konfirmasi?' : 'Terapkan') : 'Apply'}
					</button>
					<button
						type="button"
						onClick={() => skipAction(call)}
						title="Jangan terapkan yang ini - AI tetap dikabari dan melanjutkan"
						className="flex items-center justify-center gap-1 rounded-lg bg-[var(--overlay-hover)] px-3 py-1.5 text-xs text-muted transition-colors hover:text-foreground"
					>
						<SkipForward className="h-3.5 w-3.5" />
						Lewati
					</button>
				</div>
			)}
		</div>
	)
}

/** Pemisah visual antar tugas di transkrip (M7). */
function TaskSeparator() {
	return (
		<div className="flex items-center gap-2 py-1" role="separator" aria-label="Topik baru">
			<span className="h-px flex-1 bg-foreground/10" />
			<span className="text-[10px] uppercase tracking-wide text-subtle">Topik baru</span>
			<span className="h-px flex-1 bg-foreground/10" />
		</div>
	)
}

// ── lini masa langkah (§B1.3) ────────────────────────────────────────────────

/** Durasi langkah dalam detik, koma Indonesia ("0,4 dtk"). */
function formatDuration(step: ChatStep, now: number): string {
	const ms = (step.endedAt ?? now) - step.startedAt
	return `${(Math.max(0, ms) / 1000).toFixed(1).replace('.', ',')} dtk`
}

function StepIcon({ status }: { status: ChatStep['status'] }) {
	switch (status) {
		case 'running':
			return <Loader2 className="h-3 w-3 shrink-0 animate-spin text-accent" />
		case 'done':
			return <Check className="h-3 w-3 shrink-0 text-green-400" />
		case 'failed':
			return <TriangleAlert className="h-3 w-3 shrink-0 text-yellow-400" />
		case 'cancelled':
			return <Ban className="h-3 w-3 shrink-0 text-subtle" />
	}
}

/**
 * Lini masa langkah satu giliran: satu baris per langkah, dengan ikon keadaan
 * dan durasi. Menekan baris membuka rinciannya (argumen alat, ringkasan hasil,
 * atau penalaran).
 */
function StepTimeline({ steps, live }: { steps: ChatStep[]; live?: boolean }) {
	const [open, setOpen] = useState<string | null>(null)
	// Detak 1 dtk supaya durasi langkah berjalan terlihat bergerak - tidak ada
	// jeda panjang tanpa perubahan di layar (§B1.4 no. 2).
	const [now, setNow] = useState(() => Date.now())
	useEffect(() => {
		if (!live) return
		const timer = setInterval(() => setNow(Date.now()), 1000)
		return () => clearInterval(timer)
	}, [live])

	return (
		<div className="flex flex-col gap-0.5 rounded-xl bg-surface-raised p-2">
			{steps.map((step) => (
				<div key={step.id}>
					<button
						type="button"
						onClick={() => setOpen(open === step.id ? null : step.id)}
						className="flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left transition-colors hover:bg-[var(--overlay-hover)]"
					>
						<StepIcon status={step.status} />
						<span
							className={cn(
								'min-w-0 flex-1 truncate text-xs',
								step.status === 'running' ? 'text-foreground' : 'text-muted',
							)}
						>
							{step.label}
						</span>
						<span className="shrink-0 text-[10px] tabular-nums text-faint">
							{formatDuration(step, now)}
						</span>
					</button>
					{open === step.id && step.checklist && (
						<div className="mx-1.5 mb-1 flex flex-col gap-0.5 rounded-md bg-surface-inset px-2 py-1.5">
							{step.checklist.map((item, index) => (
								<span key={index} className="flex items-center gap-1.5 text-[11px] leading-relaxed text-subtle">
									{item.done ? (
										<Check className="h-3 w-3 shrink-0 text-green-400" />
									) : (
										<span className="h-3 w-3 shrink-0 rounded-full border border-faint" />
									)}
									<span className={cn(item.done && 'line-through opacity-60')}>{item.text}</span>
								</span>
							))}
						</div>
					)}
					{open === step.id && !step.checklist && step.detail && (
						<p className="mx-1.5 mb-1 whitespace-pre-wrap break-words rounded-md bg-surface-inset px-2 py-1.5 font-mono text-[11px] leading-relaxed text-subtle">
							{step.detail}
						</p>
					)}
				</div>
			))}
		</div>
	)
}

/** Ringkasan lini masa giliran yang sudah selesai: "3 langkah · 2,1 dtk". */
function StepSummary({ steps, usage }: { steps: ChatStep[]; usage?: ChatUsage }) {
	const [open, setOpen] = useState(false)
	const first = steps[0]
	const last = steps[steps.length - 1]
	const totalMs = (last.endedAt ?? last.startedAt) - first.startedAt

	return (
		<div className="flex flex-col gap-1">
			<button
				type="button"
				onClick={() => setOpen(!open)}
				aria-expanded={open}
				className="flex items-center gap-1 self-start text-[11px] text-faint transition-colors hover:text-subtle"
			>
				{open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
				{steps.length} langkah · {(Math.max(0, totalMs) / 1000).toFixed(1).replace('.', ',')} dtk
			</button>
			{open && <StepTimeline steps={steps} />}
			{usage && (usage.promptTokens !== undefined || usage.completionTokens !== undefined) && (
				<p className="text-[10px] text-faint">
					{(usage.promptTokens ?? 0).toLocaleString('id-ID')} token masuk ·{' '}
					{(usage.completionTokens ?? 0).toLocaleString('id-ID')} keluar
				</p>
			)}
		</div>
	)
}
