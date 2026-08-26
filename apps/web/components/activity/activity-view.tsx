'use client'

import { Activity, ArrowLeft, Trash2 } from 'lucide-react'
import Link from 'next/link'
import { useMemo, useState } from 'react'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { useClearHistory, useHistory } from '@/features/history/use-history'
import type { HistoryEntry, HistoryFeature } from '@/features/history/types'
import { GROUP_ORDER, groupOf } from '@/lib/day-groups'
import { cn } from '@/lib/utils'
import { ActivityDetail } from './activity-detail'
import { FEATURE_META } from './feature-meta'

const timeFormat = new Intl.DateTimeFormat('id-ID', { hour: '2-digit', minute: '2-digit' })

const FILTERS: Array<{ key: HistoryFeature | 'all'; label: string }> = [
	{ key: 'all', label: 'Semua' },
	{ key: 'grammar', label: 'Proofreader' },
	{ key: 'research', label: 'Riset Web' },
	{ key: 'ai_detector', label: 'AI Detector' },
	{ key: 'ai_rewriter', label: 'AI Rewriter' },
	{ key: 'humanizer', label: 'Humanizer' },
	{ key: 'plagiarism', label: 'Plagiarism' },
]
function EntryRow({
	entry,
	selected,
	onSelect,
}: {
	entry: HistoryEntry
	selected: boolean
	onSelect: () => void
}) {
	const meta = entry.feature ? FEATURE_META[entry.feature] : null
	return (
		<button
			type="button"
			onClick={onSelect}
			className={cn(
				'w-full rounded-xl px-3 py-2.5 text-left transition-colors',
				selected ? 'bg-accent/15' : 'hover:bg-[var(--overlay-hover)]',
			)}
		>
			<div className="flex items-center gap-2">
				{meta && <meta.icon className="h-4 w-4 shrink-0 text-muted" />}
				<span className="text-sm font-medium text-foreground">{meta?.label ?? 'Modul AI'}</span>
				<span className="ml-auto shrink-0 text-xs text-subtle">
					{timeFormat.format(new Date(entry.createdAt))}
				</span>
			</div>
			<div className="mt-0.5 truncate pl-6 text-xs text-muted">
				{entry.documentTitle ?? 'Tanpa tautan dokumen'}
			</div>
			<div className="mt-0.5 truncate pl-6 text-xs text-subtle">
				{entry.summary ?? (entry.status === 'failed' ? 'Job gagal' : 'Belum ada hasil')}
			</div>
		</button>
	)
}
export function ActivityView() {
	const [filter, setFilter] = useState<HistoryFeature | 'all'>('all')
	const [selectedJobId, setSelectedJobId] = useState<string | null>(null)
	const [confirmOpen, setConfirmOpen] = useState(false)
	const [clearError, setClearError] = useState<string | null>(null)

	const history = useHistory(filter === 'all' ? undefined : filter)
	const clearHistory = useClearHistory()

	const entries = useMemo(
		() => history.data?.pages.flatMap((page) => page.entries) ?? [],
		[history.data],
	)

	const grouped = useMemo(() => {
		const map = new Map<string, HistoryEntry[]>()
		for (const entry of entries) {
			const key = groupOf(entry.createdAt)
			const list = map.get(key) ?? []
			list.push(entry)
			map.set(key, list)
		}
		return GROUP_ORDER.filter((key) => map.has(key)).map((key) => ({
			label: key,
			items: map.get(key) ?? [],
		}))
	}, [entries])

	async function handleClearAll() {
		setConfirmOpen(false)
		setClearError(null)
		try {
			await clearHistory.mutateAsync()
			setSelectedJobId(null)
		} catch {
			setClearError('Gagal menghapus aktivitas. Coba lagi.')
		}
	}

	return (
		<div className="flex min-h-screen flex-col bg-background">
			<header className="sticky top-0 z-20 flex items-center gap-3 border-b border-line bg-surface px-4 py-3">
				<Link
					href="/"
					className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted transition-colors hover:bg-[var(--overlay-hover)] hover:text-foreground"
					aria-label="Kembali ke editor"
				>
					<ArrowLeft className="h-5 w-5" />
				</Link>
				<div className="flex items-center gap-2">
					<Activity className="h-5 w-5 text-muted" />
					<h1 className="text-base font-medium text-foreground">Aktivitas AI</h1>
				</div>

				<div className="ml-auto flex items-center gap-2">
					{entries.length > 0 && (
						<button
							type="button"
							onClick={() => setConfirmOpen(true)}
							className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs text-muted transition-colors hover:bg-[var(--overlay-hover)] hover:text-red-400"
						>
							<Trash2 className="h-3.5 w-3.5" />
							Hapus semua aktivitas
						</button>
					)}
				</div>
			</header>

			<div className="flex min-h-0 flex-1">
				<main className="flex min-w-0 flex-1 flex-col overflow-y-auto">
					{/* Filter fitur */}
					<div className="flex shrink-0 flex-wrap gap-1.5 px-6 pt-4">
						{FILTERS.map(({ key, label }) => (
							<button
								key={key}
								type="button"
								onClick={() => setFilter(key)}
								className={cn(
									'rounded-full border px-3 py-1 text-xs transition-colors',
									filter === key
										? 'border-accent bg-accent/10 font-medium text-accent'
										: 'border-line text-muted hover:border-line-strong hover:text-foreground',
								)}
							>
								{label}
							</button>
						))}
					</div>

					<div className="flex-1 px-4 pb-6 pt-2">
						{history.isPending && (
							<p className="px-3 py-10 text-center text-sm text-muted">Memuat aktivitas…</p>
						)}
						{history.isError && (
							<p className="px-3 py-10 text-center text-sm text-red-400">
								Gagal memuat aktivitas AI.
							</p>
						)}
						{clearError && <p className="px-3 pt-2 text-xs text-red-400">{clearError}</p>}

						{!history.isPending && !history.isError && entries.length === 0 && (
							<div className="flex flex-col items-center justify-center py-20 text-center">
								<Activity className="h-8 w-8 text-faint" />
								<p className="mt-3 text-sm font-medium text-foreground">Belum ada aktivitas</p>
								<p className="mt-1 max-w-sm text-xs text-subtle">
									Jalankan Proofreader, AI Detector, AI Rewriter, Humanizer, atau Plagiarism -
									catatannya akan muncul di sini.
								</p>
							</div>
						)}

						{grouped.map((group) => (
							<div key={group.label}>
								<div className="px-3 pb-1 pt-4 text-xs font-medium text-subtle">{group.label}</div>
								<div className="flex flex-col gap-0.5">
									{group.items.map((entry) => (
										<EntryRow
											key={entry.jobId}
											entry={entry}
											selected={selectedJobId === entry.jobId}
											onSelect={() => setSelectedJobId(entry.jobId)}
										/>
									))}
								</div>
							</div>
						))}

						{history.hasNextPage && (
							<div className="flex justify-center pt-4">
								<button
									type="button"
									disabled={history.isFetchingNextPage}
									onClick={() => void history.fetchNextPage()}
									className="rounded-xl border border-line px-4 py-2 text-sm text-muted transition-colors hover:border-line-strong hover:text-foreground disabled:opacity-50"
								>
									{history.isFetchingNextPage ? 'Memuat…' : 'Muat lebih banyak'}
								</button>
							</div>
						)}
					</div>
				</main>

				{selectedJobId && (
					<ActivityDetail jobId={selectedJobId} onClose={() => setSelectedJobId(null)} />
				)}
			</div>

			<ConfirmDialog
				open={confirmOpen}
				title="Hapus semua aktivitas?"
				description="Seluruh catatan pemakaian modul AI Anda beserta hasilnya akan dihapus permanen. Dokumen Anda tidak ikut terhapus."
				confirmLabel="Hapus semua"
				danger
				onConfirm={() => void handleClearAll()}
				onCancel={() => setConfirmOpen(false)}
			/>
		</div>
	)
}
