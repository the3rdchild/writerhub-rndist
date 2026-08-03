'use client'

import { Focus, Settings as SettingsIcon, Share2 } from 'lucide-react'
import { EditorToolbar } from '@/components/editor/editor-toolbar'
import { useDocument } from '@/features/document/document-context'
import { useEditorInstance } from '@/features/editor/editor-context'
import { useGrammarCheck } from '@/features/grammar/use-grammar-check'
import { useSettings } from '@/features/settings/settings-context'
import { cn } from '@/lib/utils'
import { MenuBar } from './menu-bar'
import { NavMenu } from './nav-menu'

/**
 * Kepala aplikasi: navigasi, judul, menu, dan toolbar.
 *
 * Pada mode fokus seluruh blok ini menyusut jadi garis tipis dan baru muncul
 * kembali saat kursor mendekat, sehingga menulis panjang tidak terganggu
 * perkakas yang sebenarnya jarang disentuh.
 */
export function TopBar() {
	const { state, dispatch } = useDocument()
	const { editor } = useEditorInstance()
	const { settings, toggleFocusMode, setSettingsOpen } = useSettings()
	const { isRunning } = useGrammarCheck()

	return (
		<header
			className={cn(
				'group/topbar relative z-20 shrink-0 border-b border-line bg-surface',
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
							className="w-full max-w-[520px] truncate rounded border border-transparent bg-transparent px-1 py-0.5 text-lg font-medium text-foreground outline-none transition-colors placeholder:text-faint hover:border-line-strong focus:border-accent"
						/>
						<MenuBar />
					</div>

					<div className="flex shrink-0 items-center gap-1 pt-1">
						{isRunning && (
							<span className="mr-1 hidden text-xs text-subtle sm:inline">Memeriksa…</span>
						)}
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
						<button
							type="button"
							className="ml-1 flex items-center gap-1.5 rounded-full bg-accent px-4 py-1.5 text-sm font-medium text-accent-foreground transition-colors hover:bg-accent-hover"
						>
							<Share2 className="h-4 w-4" />
							Bagikan
						</button>
					</div>
				</div>

				<div className="flex justify-center px-3 pb-2 pt-1.5">
					<EditorToolbar editor={editor} disabled={state.file !== null} />
				</div>
			</div>
		</header>
	)
}

function HeaderButton({
	icon: Icon,
	label,
	onClick,
	active,
}: {
	icon: React.ComponentType<{ className?: string }>
	label: string
	onClick: () => void
	active?: boolean
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
			)}
		>
			<Icon className="h-[18px] w-[18px]" />
		</button>
	)
}
