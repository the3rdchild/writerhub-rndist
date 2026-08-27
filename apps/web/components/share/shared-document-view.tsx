'use client'

import { EditorContent, useEditor } from '@tiptap/react'
import { ArrowLeft, Lock } from 'lucide-react'
import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { buildEditorExtensions } from '@/features/editor/extensions'
import { pageGeometry } from '@/features/editor/page-geometry'
import {
	SHARE_ACCESS_LABELS,
	SHARE_ROLE_LABELS,
	type SharedTab,
	type SharePayload,
} from '@/features/share/types'
import { cn } from '@/lib/utils'

/**
 * Tampilan baca-saja untuk dokumen yang dibagikan.
 *
 * Datanya sudah diambil di server oleh page.tsx - komponen ini tidak lagi
 * mengambil apa pun sendiri, sehingga tidak ada keadaan memuat maupun galat
 * yang perlu diurus di sini.
 */
export function SharedDocumentView({ payload }: { payload: SharePayload }) {
	const [selectedTabId, setSelectedTabId] = useState<string | null>(payload.tabs[0]?.id ?? null)

	const selectedTab = useMemo<SharedTab | null>(
		() => payload.tabs.find((tab) => tab.id === selectedTabId) ?? null,
		[payload.tabs, selectedTabId],
	)

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

	useEffect(
		function showSelectedTab() {
			if (!editor || !selectedTab) return

			editor.commands.setContent(selectedTab.content, { emitUpdate: false })
		},
		[editor, selectedTab],
	)

	const accessLabel = SHARE_ACCESS_LABELS[payload.access]
	const roleLabel = SHARE_ROLE_LABELS[payload.role]
	const hasMultipleTabs = payload.tabs.length > 1

	return (
		<div className="flex min-h-screen flex-col bg-background">
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
