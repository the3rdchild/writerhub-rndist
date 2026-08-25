'use client'

import type { JSONContent } from '@tiptap/core'
import { EditorContent, useEditor } from '@tiptap/react'
import { ArrowLeft, Pin, Plus } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { FEATURE_META } from '@/components/activity/feature-meta'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { buildEditorExtensions } from '@/features/editor/extensions'
import { pageGeometry } from '@/features/editor/page-geometry'
import type { HistoryFeature } from '@/features/history/types'
import { useSessions } from '@/features/sessions/session-context'
import { fragmentToJSON } from '@/features/sync/serialize'
import { GROUP_ORDER, groupOf } from '@/lib/day-groups'
import { cn } from '@/lib/utils'
import { createVersion } from '@/features/versions/api'
import { computeVersionDiff, versionPlainText } from '@/features/versions/diff'
import { snapshotLocalVersion } from '@/features/versions/local-snapshot'
import type { VersionSummary } from '@/features/versions/types'
import { useVersion, useVersions, useInvalidateVersions } from '@/features/versions/use-versions'
import { useVersionMode } from '@/features/versions/version-context'
import {
	VersionDiffHighlight,
	versionDiffHighlightKey,
} from '@/features/versions/version-diff-highlight'

const timeFormat = new Intl.DateTimeFormat('id-ID', { hour: '2-digit', minute: '2-digit' })
const dateFormat = new Intl.DateTimeFormat('id-ID', {
	day: 'numeric',
	month: 'long',
	year: 'numeric',
	hour: '2-digit',
	minute: '2-digit',
})
function featureLabel(feature: string | null): string | null {
	if (!feature || !(feature in FEATURE_META)) return null
	return FEATURE_META[feature as HistoryFeature].label
}
function entryLabel(version: VersionSummary): string {
	switch (version.trigger) {
		case 'manual':
			return version.label ?? 'Diberi nama'
		case 'interval':
			return 'Otomatis'
		case 'pre_restore':
			return 'Sebelum pemulihan'
		case 'pre_translate':
			return 'Sebelum terjemah'
		case 'ai_result': {
			const label = featureLabel(version.feature)
			return label ? `Hasil AI: ${label}` : 'Hasil AI'
		}
	}
}
export function VersionHistoryView() {
	const { versionMode, closeVersionMode, restoreToVersion } = useVersionMode()
	const { doc, activeId } = useSessions()

	const [selectedId, setSelectedId] = useState<string | null>(null)
	const [showDiff, setShowDiff] = useState(true)
	const [nameDialogOpen, setNameDialogOpen] = useState(false)
	const [confirmOpen, setConfirmOpen] = useState(false)
	const [restoring, setRestoring] = useState(false)
	const [actionError, setActionError] = useState<string | null>(null)

	const versions = useVersions(versionMode)
	const detail = useVersion(versionMode, selectedId)
	const invalidateVersions = useInvalidateVersions()
	const [draftJson, setDraftJson] = useState<JSONContent | null>(null)
	useEffect(() => {
		if (activeId) setDraftJson(fragmentToJSON(doc, activeId))
	}, [doc, activeId])
	const draftText = useMemo(() => (draftJson ? versionPlainText(draftJson) : null), [draftJson])

	const selectedContent = selectedId === null ? draftJson : (detail.data?.content ?? null)
	const selectedVersion = selectedId === null ? null : (detail.data ?? null)

	const editor = useEditor({
		immediatelyRender: false,
		extensions: [...buildEditorExtensions({ geometry: pageGeometry() }), VersionDiffHighlight],
		editable: false,
		editorProps: {
			attributes: {
				class: 'document-body focus:outline-none text-[17px] leading-[1.8]',
				spellcheck: 'false',
			},
		},
	})
	useEffect(() => {
		if (!editor || editor.isDestroyed || !selectedContent) return
		editor.commands.setContent(selectedContent, { emitUpdate: false })
	}, [editor, selectedContent])
	useEffect(() => {
		if (!editor || editor.isDestroyed || !selectedContent) return
		const ranges =
			showDiff && selectedId !== null && draftText !== null
				? computeVersionDiff(versionPlainText(selectedContent), draftText)
				: null
		editor.view.dispatch(editor.state.tr.setMeta(versionDiffHighlightKey, ranges))
	}, [editor, selectedContent, showDiff, selectedId, draftText])

	const grouped = useMemo(() => {
		const map = new Map<string, VersionSummary[]>()
		for (const version of versions.data ?? []) {
			const key = groupOf(version.createdAt)
			const list = map.get(key) ?? []
			list.push(version)
			map.set(key, list)
		}
		return GROUP_ORDER.filter((key) => map.has(key)).map((key) => ({
			label: key,
			items: map.get(key) ?? [],
		}))
	}, [versions.data])

	if (!versionMode) return null

	async function handleNameVersion(label: string) {
		if (!versionMode) return
		setNameDialogOpen(false)
		setActionError(null)
		try {
			if (versionMode.serverTabId) {
				await createVersion(versionMode.serverTabId, label)
			} else {
				await snapshotLocalVersion(doc, versionMode.tabId, 'manual', label)
			}
			await invalidateVersions(versionMode)
		} catch (error) {
			setActionError(error instanceof Error ? error.message : 'Gagal menyimpan versi')
		}
	}

	async function handleRestore() {
		if (!selectedId) return
		setConfirmOpen(false)
		setRestoring(true)
		setActionError(null)
		try {
			await restoreToVersion(selectedId)
		} catch (error) {
			setActionError(error instanceof Error ? error.message : 'Pemulihan gagal')
			setRestoring(false)
		}
	}

	return (
		<div className="flex min-h-0 flex-1 flex-col bg-background">
			<header className="flex shrink-0 items-center gap-3 border-b border-line bg-surface px-4 py-3">
				<button
					type="button"
					onClick={closeVersionMode}
					aria-label="Kembali ke editor"
					title="Kembali ke editor"
					className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted transition-colors hover:bg-[var(--overlay-hover)] hover:text-foreground"
				>
					<ArrowLeft className="h-5 w-5" />
				</button>
				<div className="min-w-0">
					<h1 className="truncate text-base font-medium text-foreground">{versionMode.title}</h1>
					<p className="text-xs text-muted">
						{selectedVersion
							? dateFormat.format(new Date(selectedVersion.createdAt))
							: 'Versi saat ini'}
					</p>
				</div>
			</header>

			<div className="flex min-h-0 flex-1">
				<main className="relative flex min-w-0 flex-1 justify-center overflow-y-auto px-4 py-6">
					<div className="document-canvas w-full max-w-[816px]">
						<div className="document-sheet min-h-[1056px] bg-surface-raised p-[96px] shadow-[var(--page-shadow)]">
							<EditorContent editor={editor} />
						</div>
					</div>
					{selectedId !== null && detail.isPending && (
						<div className="absolute inset-0 flex items-center justify-center bg-background/60">
							<div className="h-8 w-8 animate-spin rounded-full border-2 border-accent border-t-transparent" />
						</div>
					)}
				</main>

				<aside className="flex w-[320px] shrink-0 flex-col border-l border-line bg-surface">
					<div className="flex shrink-0 items-center justify-between gap-2 px-4 pb-2 pt-4">
						<h2 className="text-sm font-medium text-foreground">Riwayat versi</h2>
						<button
							type="button"
							onClick={() => setNameDialogOpen(true)}
							title="Beri nama versi ini"
							className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-muted transition-colors hover:bg-[var(--overlay-hover)] hover:text-foreground"
						>
							<Plus className="h-3.5 w-3.5" />
							Beri nama versi ini
						</button>
					</div>

					<div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
						<button
							type="button"
							onClick={() => setSelectedId(null)}
							className={cn(
								'w-full rounded-lg px-3 py-2 text-left transition-colors',
								selectedId === null
									? 'bg-accent/15 text-foreground'
									: 'hover:bg-[var(--overlay-hover)]',
							)}
						>
							<div className="text-sm font-medium text-foreground">Versi saat ini</div>
							<div className="text-xs text-muted">Draf yang sedang dikerjakan</div>
						</button>

						{versions.isPending && (
							<p className="px-3 py-4 text-xs text-muted">Memuat riwayat…</p>
						)}
						{versions.isError && (
							<p className="px-3 py-4 text-xs text-red-400">Gagal memuat riwayat versi.</p>
						)}

						{grouped.map((group) => (
							<div key={group.label}>
								<div className="px-3 pb-1 pt-4 text-xs font-medium text-subtle">{group.label}</div>
								{group.items.map((version) => (
									<button
										key={version.id}
										type="button"
										onClick={() => setSelectedId(version.id)}
										className={cn(
											'w-full rounded-lg px-3 py-2 text-left transition-colors',
											selectedId === version.id
												? 'bg-accent/15 text-foreground'
												: 'hover:bg-[var(--overlay-hover)]',
										)}
									>
										<div className="text-sm text-foreground">
											{timeFormat.format(new Date(version.createdAt))}
										</div>
										<div className="mt-0.5 flex items-center gap-1 text-xs text-muted">
											{version.trigger === 'manual' && <Pin className="h-3 w-3 shrink-0" />}
											<span className="truncate">{entryLabel(version)}</span>
											<span aria-hidden>•</span>
											<span className="shrink-0">
												{version.wordCount.toLocaleString('id-ID')} kata
											</span>
										</div>
									</button>
								))}
							</div>
						))}
					</div>

					<div className="flex shrink-0 flex-col gap-3 border-t border-line px-4 py-3">
						<label
							className={cn(
								'flex items-center gap-2 text-sm',
								selectedId === null ? 'text-faint' : 'text-muted',
							)}
						>
							<input
								type="checkbox"
								checked={showDiff}
								disabled={selectedId === null}
								onChange={(event) => setShowDiff(event.target.checked)}
								className="h-4 w-4 accent-[var(--accent)]"
							/>
							Sorot perubahan
						</label>
						{selectedId !== null && (
							<button
								type="button"
								disabled={restoring}
								onClick={() => setConfirmOpen(true)}
								className="rounded-xl bg-accent px-4 py-2 text-sm font-medium text-accent-foreground transition-colors hover:bg-accent-hover disabled:opacity-50"
							>
								{restoring ? 'Memulihkan…' : 'Pulihkan versi ini'}
							</button>
						)}
						{actionError && <p className="text-xs text-red-400">{actionError}</p>}
					</div>
				</aside>
			</div>

			<ConfirmDialog
				open={confirmOpen}
				title="Pulihkan versi ini?"
				description="Naskah akan dikembalikan ke versi yang dipilih. Draf saat ini disimpan otomatis sebagai versi 'Sebelum pemulihan'."
				confirmLabel="Pulihkan"
				onConfirm={() => void handleRestore()}
				onCancel={() => setConfirmOpen(false)}
			/>
			<NameVersionDialog
				open={nameDialogOpen}
				onSubmit={(label) => void handleNameVersion(label)}
				onCancel={() => setNameDialogOpen(false)}
			/>
		</div>
	)
}
function NameVersionDialog({
	open,
	onSubmit,
	onCancel,
}: {
	open: boolean
	onSubmit: (label: string) => void
	onCancel: () => void
}) {
	const [label, setLabel] = useState('')

	useEffect(() => {
		if (!open) return
		setLabel('')
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key === 'Escape') onCancel()
		}
		window.addEventListener('keydown', onKeyDown)
		return () => window.removeEventListener('keydown', onKeyDown)
	}, [open, onCancel])

	if (!open) return null

	return (
		<div
			role="dialog"
			aria-modal="true"
			aria-label="Beri nama versi ini"
			className="fixed inset-0 z-[70] flex animate-in items-center justify-center bg-black/60 backdrop-blur-sm fade-in duration-200"
			onClick={(event) => {
				if (event.target === event.currentTarget) onCancel()
			}}
		>
			<form
				className="flex w-full max-w-sm animate-in flex-col gap-4 rounded-2xl border border-line-strong bg-surface-raised p-5 shadow-2xl zoom-in-95 duration-200"
				onSubmit={(event) => {
					event.preventDefault()
					const trimmed = label.trim()
					if (trimmed) onSubmit(trimmed)
				}}
			>
				<h2 className="text-base font-semibold text-foreground">Beri nama versi ini</h2>
				<input
					autoFocus
					value={label}
					onChange={(event) => setLabel(event.target.value)}
					placeholder="Nama versi"
					maxLength={255}
					className="rounded-xl border border-line-strong bg-surface px-3 py-2 text-sm text-foreground outline-none transition-colors placeholder:text-faint focus:border-accent"
				/>
				<div className="flex justify-end gap-2">
					<button
						type="button"
						onClick={onCancel}
						className="rounded-xl px-4 py-2 text-sm text-muted transition-colors hover:bg-[var(--overlay-hover)] hover:text-foreground"
					>
						Batal
					</button>
					<button
						type="submit"
						disabled={!label.trim()}
						className="rounded-xl bg-accent px-4 py-2 text-sm font-medium text-accent-foreground transition-colors hover:bg-accent-hover disabled:opacity-50"
					>
						Simpan
					</button>
				</div>
			</form>
		</div>
	)
}
