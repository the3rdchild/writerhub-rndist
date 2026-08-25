'use client'

import { ArrowLeft, FileText, Folder, Lock } from 'lucide-react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useEditor, EditorContent } from '@tiptap/react'
import { useEffect, useMemo, useState } from 'react'
import { buildEditorExtensions } from '@/features/editor/extensions'
import { pageGeometry } from '@/features/editor/page-geometry'
import { fetchShare } from '@/features/share/api'
import {
	SHARE_ACCESS_LABELS,
	SHARE_ROLE_LABELS,
	type SharedTab,
	type SharePayload,
} from '@/features/share/types'
import { cn } from '@/lib/utils'

/**
 * Halaman pembuka PROYEK yang dibagikan lewat link backend.
 *
 * Token diambil dari path `/share/<token>`, lalu pohon dokumen dibaca dari
 * `/api/shares/<token>`. Sidebar kiri daftar dokumen (+ tabnya bila lebih
 * dari satu); panel kanan merender tab terpilih dalam editor Tiptap read-only.
 */
export default function SharePage() {
	const params = useParams()
	const token = typeof params.token === 'string' ? params.token : ''
	const [payload, setPayload] = useState<SharePayload | null>(null)
	const [error, setError] = useState<string | null>(null)
	const [loading, setLoading] = useState(true)
	const [selectedTabId, setSelectedTabId] = useState<string | null>(null)

	useEffect(() => {
		if (!token) {
			setLoading(false)
			setError('Token share tidak valid')
			return
		}

		setLoading(true)
		setError(null)
		fetchShare(token)
			.then((data) => {
				setPayload(data)
				setSelectedTabId(data.documents[0]?.tabs[0]?.id ?? null)
			})
			.catch((cause) => setError(cause instanceof Error ? cause.message : 'Gagal memuat proyek'))
			.finally(() => setLoading(false))
	}, [token])

	const selectedTab = useMemo<SharedTab | null>(() => {
		if (!payload || !selectedTabId) return null
		for (const document of payload.documents) {
			const tab = document.tabs.find((item) => item.id === selectedTabId)
			if (tab) return tab
		}
		return null
	}, [payload, selectedTabId])

	const editor = useEditor({
		immediatelyRender: false,
		extensions: buildEditorExtensions({ geometry: pageGeometry() }),
		content: selectedTab?.content,
		editable: false,
		editorProps: {
			attributes: {
				class: 'document-body focus:outline-none text-[17px] leading-[1.8]',
				spellcheck: 'false',
			},
		},
	})

	useEffect(() => {
		if (editor && selectedTab) {
			editor.commands.setContent(selectedTab.content, { emitUpdate: false })
		}
	}, [editor, selectedTab])

	if (loading) {
		return (
			<div className="flex min-h-screen items-center justify-center bg-background">
				<div className="h-8 w-8 animate-spin rounded-full border-2 border-accent border-t-transparent" />
			</div>
		)
	}

	if (error || !payload) {
		return (
			<div className="flex min-h-screen flex-col items-center justify-center bg-background px-6 text-center">
				<FileText className="h-12 w-12 text-faint" />
				<h1 className="mt-4 text-lg font-medium text-foreground">Proyek tidak ditemukan</h1>
				<p className="mt-1 max-w-md text-sm text-muted">
					{error || 'Link proyek ini rusak atau sudah tidak tersedia.'}
				</p>
				<Link
					href="/"
					className="mt-6 rounded-xl bg-accent px-5 py-2 text-sm font-medium text-accent-foreground transition-colors hover:bg-accent-hover"
				>
					Kembali ke editor
				</Link>
			</div>
		)
	}

	const accessLabel = SHARE_ACCESS_LABELS[payload.access]
	const roleLabel = SHARE_ROLE_LABELS[payload.role]
	const hasContent = payload.documents.some((document) => document.tabs.length > 0)

	return (
		<div className="flex min-h-screen flex-col bg-background">
			{/* Header */}
			<header className="sticky top-0 z-20 flex items-center justify-between gap-4 border-b border-line bg-surface px-4 py-3">
				<div className="flex min-w-0 items-center gap-3">
					<Link
						href="/"
						className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted transition-colors hover:bg-[var(--overlay-hover)] hover:text-foreground"
						aria-label="Kembali ke editor"
					>
						<ArrowLeft className="h-5 w-5" />
					</Link>
					<div className="min-w-0">
						<h1 className="truncate text-base font-medium text-foreground">{payload.projectName}</h1>
						<div className="flex items-center gap-1.5 text-xs text-muted">
							<Lock className="h-3 w-3" />
							<span>{accessLabel.label}</span>
							<span>•</span>
							<span>{roleLabel}</span>
						</div>
					</div>
				</div>
				<Link
					href="/"
					className="hidden rounded-xl bg-accent px-4 py-2 text-sm font-medium text-accent-foreground transition-colors hover:bg-accent-hover sm:inline-block"
				>
					Buka di editor
				</Link>
			</header>

			{!hasContent ? (
				<div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
					<Folder className="h-12 w-12 text-faint" />
					<h2 className="mt-4 text-lg font-medium text-foreground">Proyek ini kosong</h2>
					<p className="mt-1 max-w-md text-sm text-muted">Belum ada dokumen di dalamnya.</p>
				</div>
			) : (
				<div className="flex flex-1 overflow-hidden">
					{/* Sidebar dokumen/tab */}
					<aside className="w-64 shrink-0 overflow-y-auto border-r border-line px-2 py-4">
						{payload.documents.map((document) => (
							<div key={document.id} className="mb-3">
								<p className="flex items-center gap-2 truncate px-2 py-1 text-xs font-semibold uppercase tracking-wide text-faint">
									<FileText className="h-3.5 w-3.5 shrink-0" />
									{document.title}
								</p>
								{document.tabs.map((tab) => (
									<button
										key={tab.id}
										type="button"
										onClick={() => setSelectedTabId(tab.id)}
										className={cn(
											'flex w-full items-center gap-2 truncate rounded-lg px-3 py-1.5 text-left text-sm transition-colors',
											selectedTabId === tab.id
												? 'bg-[var(--overlay-active)] font-medium text-foreground'
												: 'text-muted hover:bg-[var(--overlay-hover)] hover:text-foreground',
										)}
									>
										{tab.emoji && <span className="shrink-0">{tab.emoji}</span>}
										<span className="truncate">{tab.title}</span>
									</button>
								))}
							</div>
						))}
					</aside>

					{/* Canvas */}
					<main className="flex flex-1 justify-center overflow-y-auto px-4 py-6">
						<div className="document-canvas w-full max-w-[816px]">
							<div className="document-sheet min-h-[1056px] bg-surface-raised p-[96px] shadow-[var(--page-shadow)]">
								<EditorContent editor={editor} />
							</div>
						</div>
					</main>
				</div>
			)}
		</div>
	)
}
