'use client'

import type { LucideIcon } from 'lucide-react'
import { type PanelId, usePanels } from '@/features/analysis/panel-context'
import { cn } from '@/lib/utils'

export interface RailItem {
	id: PanelId
	icon: LucideIcon
	label: string
}

/**
 * Satu pulau tombol di rail kanan.
 *
 * Diekstrak karena rail-nya sekarang punya dua pulau: dua salinan perilaku
 * melebar-saat-disentuh yang menyimpang beberapa piksel adalah bug yang tetap
 * "berfungsi", jadi tak ada yang melaporkannya.
 *
 * Melebarnya kini murni CSS - `w-14` menjadi `w-52` saat di-hover - bukan
 * penangan tetikus yang memutasi `style.width`. Selain lebih sedikit kode, ia
 * menghapus dua penangan pada elemen yang tidak bisa difokus keyboard: pulau
 * ini memang bukan kontrol, tombol-tombol di dalamnya yang kontrol.
 */
export function RailIsland({ items }: { items: readonly RailItem[] }) {
	const { activePanel, togglePanel } = usePanels()

	return (
		<div className="group/rail w-14 overflow-hidden rounded-2xl border border-line bg-surface-raised py-2 shadow-[var(--page-shadow)] transition-[width] duration-200 ease-out hover:w-52">
			{items.map(({ id, icon: Icon, label }) => {
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
