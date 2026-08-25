'use client'

import { Focus, History, PanelLeft, Settings as SettingsIcon, Share2 } from 'lucide-react'
import { useState } from 'react'
import { EditorToolbar } from '@/components/editor/editor-toolbar'
import { SearchBar } from '@/components/editor/search-bar'
import { TocPanel } from '@/components/editor/toc-panel'
import { useDocument } from '@/features/document/document-context'
import { useEditorInstance } from '@/features/editor/editor-context'
import { useGrammarCheck } from '@/features/grammar/use-grammar-check'
import { useSessions } from '@/features/sessions/session-context'
import { useSettings } from '@/features/settings/settings-context'
import { useShare } from '@/features/share/share-context'
import { useSync } from '@/features/sync/sync-context'
import { useVersionMode } from '@/features/versions/version-context'
import { cn } from '@/lib/utils'
import { MenuBar } from './menu-bar'
import { NavMenu } from './nav-menu'
export function TopBar() {
	const { state, dispatch } = useDocument()
	const { editor } = useEditorInstance()
	const { settings, update, toggleFocusMode, setSettingsOpen } = useSettings()
	const { setShareOpen } = useShare()
	const { isRunning } = useGrammarCheck()
	const { linkage } = useSync()
	const { activeId, sessions } = useSessions()
	const { versionMode, openVersionMode } = useVersionMode()

	const [searchOpen, setSearchOpen] = useState(false)
	const [tocOpen, setTocOpen] = useState(false)
	const serverId = activeId ? linkage[activeId]?.serverId : undefined
	const activeTabTitle =
		sessions.find((tab) => tab.id === activeId)?.title ?? state.title
	const inVersionMode = versionMode !== null

	return (
		<header
			className={cn(
				'group/topbar relative z-[60] shrink-0 bg-surface',
				settings.focusMode && 'h-2 overflow-hidden hover:h-auto hover:overflow-visible',
			)}
		>
			<div
				className={cn(
					'transition-opacity',
					settings.focusMode && 'opacity-0 group-hover/topbar:opacity-100',
				)}
			>
				<div className="flex items-start gap-2 px-3 pt-2">
					<NavMenu />

					<div className="min-w-0 flex-1">
						<input
							value={state.title}
							onChange={(event) => dispatch({ type: 'setTitle', title: event.target.value })}
							placeholder="Dokumen tanpa judul"
							aria-label="Judul dokumen"
							readOnly={inVersionMode}
							className={cn(
								'w-full max-w-[520px] truncate rounded border border-transparent bg-transparent px-1 py-0.5 text-lg font-medium text-foreground outline-none transition-colors placeholder:text-faint',
								inVersionMode
									? 'cursor-default'
									: 'hover:border-line-strong focus:border-accent',
							)}
						/>
						<MenuBar />
					</div>

					<div className="flex shrink-0 items-center gap-1 pt-1">
						{isRunning && (
							<span className="mr-1 hidden text-xs text-subtle sm:inline">Memeriksa…</span>
						)}
						<HeaderButton
							icon={PanelLeft}
							label="Tab dokumen"
							active={settings.showDocumentTabs}
							onClick={() => update({ showDocumentTabs: !settings.showDocumentTabs })}
						/>
						<HeaderButton
							icon={Focus}
							label="Mode fokus"
							active={settings.focusMode}
							onClick={toggleFocusMode}
						/>
						<HeaderButton
							icon={SettingsIcon}
							label="Pengaturan"
							onClick={() => setSettingsOpen(true)}
						/>
						<HeaderButton
							icon={History}
							label={inVersionMode ? 'Riwayat versi sedang terbuka' : 'Riwayat versi'}
							active={inVersionMode}
							disabled={!activeId || inVersionMode}
							onClick={() => {
								if (activeId) {
									openVersionMode({
										tabId: activeId,
										serverTabId: serverId ?? null,
										title: activeTabTitle,
									})
								}
							}}
						/>
						<button
							type="button"
							onClick={() => setShareOpen(true)}
							disabled={inVersionMode}
							title={inVersionMode ? 'Keluar dari riwayat versi untuk membagikan' : undefined}
							className={cn(
								'ml-1 flex items-center gap-1.5 rounded-full bg-accent px-4 py-1.5 text-sm font-medium text-accent-foreground transition-colors',
								inVersionMode ? 'cursor-not-allowed opacity-40' : 'hover:bg-accent-hover',
							)}
						>
							<Share2 className="h-4 w-4" />
							Bagikan
						</button>
					</div>
				</div>

				{/* Tidak ada yang bisa disunting di mode riwayat - toolbar tanpa editor
				    hanya deretan tombol yang tidak melakukan apa pun. */}
				{!inVersionMode && (
				<div className="flex flex-col items-center gap-1.5 px-3 pb-2 pt-1.5">
					<EditorToolbar
						editor={editor}
						disabled={state.file !== null}
						onOpenSearch={() => setSearchOpen(true)}
						onOpenToc={() => setTocOpen((v) => !v)}
					/>
					{searchOpen && editor && (
						<div className="w-full max-w-2xl">
							<SearchBar editor={editor} onClose={() => setSearchOpen(false)} />
						</div>
					)}
				</div>
			)}

			{/* Panel daftar isi melayang di kanan, di bawah toolbar. */}
			{tocOpen && editor && !inVersionMode && (
				<div className="absolute right-3 top-32 z-30 h-80 w-64 overflow-hidden rounded-xl border border-line-strong bg-surface-raised shadow-[var(--menu-shadow)]">
					<TocPanel editor={editor} onClose={() => setTocOpen(false)} />
				</div>
			)}
		</div>
	</header>
	)
}

function HeaderButton({
	icon: Icon,
	label,
	onClick,
	active,
	disabled,
}: {
	icon: React.ComponentType<{ className?: string }>
	label: string
	onClick: () => void
	active?: boolean
	disabled?: boolean
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			title={label}
			aria-label={label}
			aria-pressed={active}
			className={cn(
				'flex h-9 w-9 items-center justify-center rounded-lg transition-colors',
				active
					? 'bg-accent/15 text-accent'
					: 'text-muted hover:bg-[var(--overlay-hover)] hover:text-foreground',
				disabled && 'cursor-not-allowed opacity-40 hover:bg-transparent hover:text-muted',
			)}
		>
			<Icon className="h-[18px] w-[18px]" />
		</button>
	)
}
