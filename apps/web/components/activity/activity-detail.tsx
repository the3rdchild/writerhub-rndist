'use client'

import type {
	AiDetectorResult,
	AiRewriterResult,
	GrammarResultPayload,
	HumanizerResult,
	PlagiarismResult,
	ResearchResultPayload,
} from '@writer-hub/shared'
import { ArrowRight, Trash2, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { resolveSpan } from '@/features/document/suggestions'
import { canOpenInPanel, canReapply, tabPlainText } from '@/features/history/reapply'
import { useReapply } from '@/features/history/use-reapply'
import { useDeleteHistoryEntry, useHistoryEntry } from '@/features/history/use-history'
import type { HistoryDetail } from '@/features/history/types'
import { useSessions } from '@/features/sessions/session-context'
import { cn } from '@/lib/utils'
import { FEATURE_META, STATUS_LABELS } from './feature-meta'

const dateFormat = new Intl.DateTimeFormat('id-ID', {
	day: 'numeric',
	month: 'long',
	year: 'numeric',
	hour: '2-digit',
	minute: '2-digit',
})
function ChangeRow({
	original,
	replacement,
	stale,
}: {
	original: string
	replacement: string
	stale: boolean
}) {
	return (
		<div
			className={cn(
				'rounded-xl border border-line bg-surface-raised p-3',
				stale && 'opacity-60',
			)}
		>
			<p className="text-xs leading-relaxed text-muted line-through">{original}</p>
			<p className="mt-1 text-xs leading-relaxed text-foreground">{replacement}</p>
			{stale && (
				<p className="mt-2 text-[11px] font-medium text-yellow-400">teks sudah berubah</p>
			)}
		</div>
	)
}
function hostOf(url: string): string {
	try {
		return new URL(url).hostname.replace(/^www\./, '')
	} catch {
		return url
	}
}
function SourceRow({ source }: { source: ResearchResultPayload['sources'][number] }) {
	return (
		<a
			href={source.url}
			target="_blank"
			rel="noreferrer noopener"
			className="rounded-xl border border-line bg-surface-raised p-3 transition-colors hover:border-accent/40"
		>
			<p className="text-xs font-medium leading-relaxed text-foreground">{source.title}</p>
			<p className="mt-1 text-[11px] text-subtle">
				{[
					hostOf(source.url),
					source.publishedAt,
					source.extracted ? 'dibaca penuh' : null,
				]
					.filter(Boolean)
					.join(' · ')}
			</p>
			{source.snippet && (
				<p className="mt-1 line-clamp-3 text-[11px] leading-relaxed text-muted">{source.snippet}</p>
			)}
		</a>
	)
}
function ResultBody({ detail, text }: { detail: HistoryDetail; text: string }) {
	const result = detail.result
	if (!result) return null

	if (detail.feature === 'grammar') {
		const grammar = result as GrammarResultPayload
		const suggestions = grammar.suggestions ?? []
		return (
			<div className="flex flex-col gap-2">
				<p className="px-1 text-[11px] text-subtle">{suggestions.length} saran</p>
				{suggestions.map((suggestion) => (
					<ChangeRow
						key={suggestion.id}
						original={suggestion.original}
						replacement={suggestion.replacement}
						stale={resolveSpan(text, suggestion.original, suggestion.offset) === null}
					/>
				))}
			</div>
		)
	}

	if (detail.feature === 'ai_rewriter' || detail.feature === 'humanizer') {
		const changes = (result as AiRewriterResult | HumanizerResult).changes ?? []
		return (
			<div className="flex flex-col gap-2">
				<p className="px-1 text-[11px] text-subtle">{changes.length} perubahan</p>
				{changes.map((change, index) => (
					<ChangeRow
						key={`${change.offset}-${index}`}
						original={change.original}
						replacement={change.replacement}
						stale={resolveSpan(text, change.original, change.offset) === null}
					/>
				))}
			</div>
		)
	}

	if (detail.feature === 'ai_detector') {
		const detector = result as AiDetectorResult
		return (
			<div className="flex flex-col gap-2">
				{detector.sentences.map((sentence, index) => (
					<div
						key={`${sentence.offset}-${index}`}
						className="rounded-xl border border-line bg-surface-raised p-3"
					>
						<p className="text-xs leading-relaxed text-foreground">{sentence.text}</p>
						<p className="mt-1 text-[11px] text-subtle">{sentence.score}% AI</p>
					</div>
				))}
			</div>
		)
	}

	if (detail.feature === 'research') {
		const research = result as ResearchResultPayload
		return (
			<div className="flex flex-col gap-2">
				<p className="px-1 text-[11px] text-subtle">
					&ldquo;{research.query}&rdquo; · {research.sources.length} sumber
				</p>
				{research.sources.map((source) => (
					<SourceRow key={source.url} source={source} />
				))}
			</div>
		)
	}

	if (detail.feature === 'plagiarism') {
		const plagiarism = result as PlagiarismResult
		return (
			<div className="flex flex-col gap-2">
				{plagiarism.flagged_phrases.map((phrase, index) => (
					<div
						key={`${phrase.offset}-${index}`}
						className="rounded-xl border border-line bg-surface-raised p-3"
					>
						<p className="text-xs leading-relaxed text-foreground">{phrase.text}</p>
						<p className="mt-1 text-[11px] text-subtle">
							{Math.round(phrase.similarity * 100)}% kemiripan
						</p>
					</div>
				))}
			</div>
		)
	}

	return null
}
export function ActivityDetail({
	jobId,
	onClose,
}: {
	jobId: string
	onClose: () => void
}) {
	const { doc, activeId } = useSessions()
	const detailQuery = useHistoryEntry(jobId)
	const detail = detailQuery.data ?? null
	const deleteEntry = useDeleteHistoryEntry()
	const [confirmOpen, setConfirmOpen] = useState(false)

	const { documentReady, opening, openError, openTargetDocument, reapply } = useReapply(detail)
	const currentText = useMemo(
		() => (activeId && documentReady ? tabPlainText(doc, activeId) : ''),
		[doc, activeId, documentReady, detail?.jobId],
	)

	const meta = detail?.feature ? FEATURE_META[detail.feature] : null
	// Riset web cuma catatan sumber - tidak ada yang bisa diterapkan ke naskah.
	const actionable = canOpenInPanel(detail?.feature ?? null)
	const canAct =
		actionable && detail !== null && detail.status === 'completed' && detail.result !== null

	async function handleDelete() {
		setConfirmOpen(false)
		try {
			await deleteEntry.mutateAsync(jobId)
			onClose()
		} catch {
		}
	}

	return (
		<aside className="flex w-[380px] shrink-0 flex-col border-l border-line bg-surface">
			<div className="flex shrink-0 items-center justify-between gap-2 px-4 pb-2 pt-4">
				<div className="flex min-w-0 items-center gap-2">
					{meta && <meta.icon className="h-4 w-4 shrink-0 text-muted" />}
					<h2 className="truncate text-sm font-medium text-foreground">
						{meta?.label ?? 'Aktivitas'}
					</h2>
				</div>
				<button
					type="button"
					onClick={onClose}
					aria-label="Tutup detail"
					title="Tutup detail"
					className="rounded-md p-1 text-subtle transition-colors hover:bg-[var(--overlay-hover)] hover:text-foreground"
				>
					<X className="h-4 w-4" />
				</button>
			</div>

			<div className="min-h-0 flex-1 overflow-y-auto px-4 pb-3">
				{detailQuery.isPending && <p className="py-6 text-center text-xs text-muted">Memuat hasil…</p>}
				{detailQuery.isError && (
					<p className="py-6 text-center text-xs text-red-400">Gagal memuat detail aktivitas.</p>
				)}

				{detail && (
					<div className="flex flex-col gap-3">
						<div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
							<span>{dateFormat.format(new Date(detail.createdAt))}</span>
							<span aria-hidden>•</span>
							<span
								className={cn(
									'rounded-full px-2 py-0.5 text-[10px] font-semibold',
									detail.status === 'completed' && 'bg-green-400/10 text-green-400',
									detail.status === 'failed' && 'bg-red-400/10 text-red-400',
									(detail.status === 'pending' || detail.status === 'processing') &&
										'bg-yellow-400/10 text-yellow-400',
								)}
							>
								{STATUS_LABELS[detail.status] ?? detail.status}
							</span>
						</div>

						<p className="truncate text-xs text-muted">
							{detail.documentTitle ?? 'Tanpa tautan dokumen'}
						</p>

						{detail.summary && <p className="text-sm text-foreground">{detail.summary}</p>}

						{detail.status === 'failed' && (
							<p className="rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs leading-relaxed text-red-400">
								{detail.error ?? 'Job gagal diproses.'}
							</p>
						)}

						<ResultBody detail={detail} text={currentText} />
					</div>
				)}
			</div>

			{detail && (
				<div className="flex shrink-0 flex-col gap-2 border-t border-line px-4 py-3">
					{!documentReady && detail.tabId && actionable && (
						<>
							<button
								type="button"
								disabled={opening}
								onClick={() => void openTargetDocument()}
								className="flex w-full items-center justify-center gap-2 rounded-xl bg-accent px-4 py-2 text-sm font-medium text-accent-foreground transition-colors hover:bg-accent-hover disabled:opacity-50"
							>
								<ArrowRight className="h-4 w-4" />
								{opening ? 'Membuka…' : 'Buka dokumen untuk menerapkan'}
							</button>
							{openError && <p className="text-xs text-red-400">{openError}</p>}
						</>
					)}

					{documentReady && canAct && (
						<button
							type="button"
							onClick={reapply}
							className="w-full rounded-xl bg-accent px-4 py-2 text-sm font-medium text-accent-foreground transition-colors hover:bg-accent-hover"
						>
							{canReapply(detail.feature) ? 'Terapkan ulang' : 'Buka di panel'}
						</button>
					)}

					<button
						type="button"
						onClick={() => setConfirmOpen(true)}
						className="flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm text-muted transition-colors hover:bg-[var(--overlay-hover)] hover:text-red-400"
					>
						<Trash2 className="h-4 w-4" />
						Hapus entri ini
					</button>
				</div>
			)}

			<ConfirmDialog
				open={confirmOpen}
				title="Hapus entri ini?"
				description="Catatan aktivitas dan hasilnya akan dihapus permanen."
				confirmLabel="Hapus"
				danger
				onConfirm={() => void handleDelete()}
				onCancel={() => setConfirmOpen(false)}
			/>
		</aside>
	)
}
