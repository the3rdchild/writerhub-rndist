'use client'

import {
	BookMarked,
	Bot,
	Languages,
	type LucideIcon,
	MessageSquare,
	MessagesSquare,
	RefreshCw,
	Search,
	SpellCheck,
	UserCheck,
} from 'lucide-react'
import { type PanelId, usePanels } from '@/features/analysis/panel-context'
import { cn } from '@/lib/utils'

/**
 * Daftar tunggal tool rail - juga dipakai menu Tools di menu bar, supaya label
 * dan ikon di kedua tempat tidak bisa melenceng satu sama lain.
 */
export const PANELS: Array<{ id: PanelId; icon: LucideIcon; label: string }> = [
	{ id: 'ai_chat', icon: MessagesSquare, label: 'AI Chat' },
	{ id: 'proofreader', icon: SpellCheck, label: 'Proofreader' },
	{ id: 'ai_detector', icon: Bot, label: 'AI Detector' },
	{ id: 'ai_rewriter', icon: RefreshCw, label: 'AI Rewriter' },
	{ id: 'humanizer', icon: UserCheck, label: 'Humanizer' },
	{ id: 'plagiarism', icon: Search, label: 'Plagiarism' },
	{ id: 'translator', icon: Languages, label: 'Translator' },
	{ id: 'glossary', icon: BookMarked, label: 'Glossary' },
	{ id: 'comments', icon: MessageSquare, label: 'Comments' },
]

const COLLAPSED_WIDTH = 56
const EXPANDED_WIDTH = 208

/**
 * Tool rail: berpindah modul tanpa meninggalkan draf yang sedang dikerjakan.
 *
 * Melayang di atas konten dan hanya menampilkan ikon; label muncul saat kursor
 * masuk dan seluruh rail melebar ke kiri. Melebarnya rail - bukan tooltip per
 * ikon - membuat kelima label terbaca sekaligus, sehingga pengguna bisa memindai
 * pilihan tanpa menyapu kursor satu per satu.
 *
 * Rail dibuat `absolute`, jadi induknya perlu menyisakan ruang di kanan
 * (lihat WorkspacePage) agar konten tidak tertutup saat rail menyempit.
 */
export function PanelRail() {
	const { activePanel, togglePanel } = usePanels()

	return (
		<div
			className="group/rail absolute right-4 top-1/2 z-30 -translate-y-1/2 overflow-hidden rounded-2xl border border-line bg-surface-raised py-2 shadow-[var(--page-shadow)] transition-[width] duration-200 ease-out"
			style={{ width: COLLAPSED_WIDTH }}
			onMouseEnter={(event) => {
				event.currentTarget.style.width = `${EXPANDED_WIDTH}px`
			}}
			onMouseLeave={(event) => {
				event.currentTarget.style.width = `${COLLAPSED_WIDTH}px`
			}}
		>
			{PANELS.map(({ id, icon: Icon, label }) => {
				const isActive = activePanel === id
				return (
					<button
						key={id}
						type="button"
						onClick={() => togglePanel(id)}
						aria-label={label}
						aria-pressed={isActive}
						className={cn(
							'flex h-11 w-full items-center gap-3 border-l-2 pl-[17px] transition-colors',
							isActive
								? 'border-accent bg-accent/10 text-accent'
								: 'border-transparent text-subtle hover:bg-[var(--overlay-hover)] hover:text-foreground',
						)}
					>
						<Icon className="h-5 w-5 shrink-0" />
						{/* Label ikut ada di DOM saat menyempit supaya tetap terbaca
						    pembaca layar; yang disembunyikan hanya tampilannya. */}
						<span className="whitespace-nowrap text-sm font-medium opacity-0 transition-opacity duration-150 group-hover/rail:opacity-100">
							{label}
						</span>
					</button>
				)
			})}
		</div>
	)
}
