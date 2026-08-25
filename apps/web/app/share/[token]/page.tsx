'use client'

import { ArrowLeft, FileText, Lock } from 'lucide-react'
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
 * Halaman pembuka DOKUMEN yang dibagikan lewat link backend.
 *
 * Token diambil dari path `/share/<token>`, lalu daftar tab dibaca dari
 * `/api/shares/<token>`. Sidebar kiri daftar tab (cuma tampil kalau lebih
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
				setSelectedTabId(data.tabs[0]?.id ?? null)
			})
			.catch((cause) => setError(cause instanceof Error ? cause.message : 'Gagal memuat dokumen'))
			.finally(() => setLoading(false))
	}, [token])

	const selectedTab = useMemo<SharedTab | null>(() => {
		if (!payload || !selectedTabId) return null
		return payload.tabs.find((tab) => tab.id === selectedTabId) ?? null
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
				<h1 className="mt-4 text-lg font-medium text-foreground">Dokumen tidak ditemukan</h1>
				<p className="mt-1 max-w-md text-sm text-muted">
					{error || 'Link dokumen ini rusak atau sudah tidak tersedia.'}
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
	const hasMultipleTabs = payload.tabs.length > 1

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
						<h1 className="truncate text-base font-medium text-foreground">{payload.documentTitle}</h1>
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

			<div className="flex flex-1 overflow-hidden">
				{/* Sidebar tab - cuma tampil kalau dokumennya punya lebih dari satu tab */}
				{hasMultipleTabs && (
					<aside className="w-56 shrink-0 overflow-y-auto border-r border-line px-2 py-4">
						{payload.tabs.map((tab) => (
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
					</aside>
				)}

				{/* Canvas */}
				<main className="flex flex-1 justify-center overflow-y-auto px-4 py-6">
					<div className="document-canvas w-full max-w-[816px]">
						<div className="document-sheet min-h-[1056px] bg-surface-raised p-[96px] shadow-[var(--page-shadow)]">
							<EditorContent editor={editor} />
						</div>
					</div>
				</main>
			</div>
		</div>
	)
}
