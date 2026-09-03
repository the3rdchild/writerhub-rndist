'use client'

import { EditorContent, useEditor } from '@tiptap/react'
import { ArrowLeft, Lock } from 'lucide-react'
import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { DocumentPaper } from '@/components/editor/document-paper'
import { buildEditorExtensions } from '@/features/editor/extensions'
import { DEFAULT_PAGE_SETUP, pageGeometry, type SheetGeometry } from '@/features/editor/page-geometry'
import { DEFAULT_TYPOGRAPHY } from '@/features/editor/typography'
import { useDocumentGeometry } from '@/features/editor/use-document-geometry'
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

	/*
	 * Tata letak datang dari muatan share, bukan dari bawaan.
	 *
	 * Penerima tautan tidak punya Y.Doc - tempat penyunting menyimpan ukuran
	 * kertas, margin, dan tipografinya - jadi keduanya dikirim server
	 * (`ShareService.getByToken`). Urutannya sama dengan `resolvePageSetup` di
	 * `sessions/ydoc.ts`: penimpa tab menang atas dasar dokumen, lalu bawaan.
	 * Tanpa ini rancangan satu halaman selalu salah bentuk, karena tingginya
	 * persis kotak konten halaman - halaman yang ternyata bukan halaman yang
	 * dirancang penulisnya.
	 */
	const setup = selectedTab?.layout?.pageSetup ?? payload.layout?.pageSetup ?? DEFAULT_PAGE_SETUP
	const typography = selectedTab?.layout?.typography ?? payload.layout?.typography ?? DEFAULT_TYPOGRAPHY
	const furniture = selectedTab?.layout?.furniture ?? payload.layout?.furniture ?? null

	const geometry = useMemo(() => pageGeometry(setup), [setup])

	// Lembar datang dari paginasi, sama seperti di kanvas: tanpa berlangganan
	// keduanya, dokumen berhalaman banyak dirender ke satu lembar raksasa.
	const [pageCount, setPageCount] = useState(1)
	const [sheets, setSheets] = useState<SheetGeometry[]>([])

	const editor = useEditor({
		immediatelyRender: false,
		extensions: buildEditorExtensions({
			geometry,
			setup,
			onPageCountChange: setPageCount,
			onSheetsChange: setSheets,
		}),
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

			const timer = window.setTimeout(() => {
				if (editor.isDestroyed) return
				editor.commands.setContent(selectedTab.content, { emitUpdate: false })
			}, 0)
			return () => window.clearTimeout(timer)
		},
		[editor, selectedTab],
	)

	// Tab lain boleh punya penimpa tata letaknya sendiri, jadi geometri yang
	// berubah harus didorong ke paginasi - extensions hanya dibangun sekali.
	useDocumentGeometry(editor, { geometry, setup })

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

				<main className="flex flex-1 justify-center overflow-auto px-4 py-6">
					<div className="document-canvas">
						<DocumentPaper
							setup={setup}
							typography={typography}
							furniture={furniture}
							sheets={sheets}
							pageCount={pageCount}
						>
							<EditorContent editor={editor} />
						</DocumentPaper>
					</div>
				</main>
			</div>
		</div>
	)
}
