'use client'

import { useEffect } from 'react'
import { usePanels } from '@/features/analysis/panel-context'
import { useSearch } from '@/features/editor/search-context'
import { cn } from '@/lib/utils'
import { SearchPopup } from './search-popup'

/**
 * Tempat bilah ringkas menggantung. Ia menempel pada area naskah (bukan pada
 * bilah alat) supaya tetap terlihat di mode fokus, dan supaya membuka pencarian
 * tidak menggeser turun seluruh halaman.
 */
export function SearchOverlay() {
	const { barOpen, controls, focusTick, openPanelSearch, closeSearch } = useSearch()
	const { activePanel } = usePanels()

	useEffect(
		function closeOnEscape() {
			if (!barOpen) return
			const onKeyDown = (event: KeyboardEvent) => {
				if (event.key === 'Escape') closeSearch()
			}
			window.addEventListener('keydown', onKeyDown)
			return () => window.removeEventListener('keydown', onKeyDown)
		},
		[barOpen, closeSearch],
	)

	if (!barOpen) return null

	return (
		/* Panel analisis lebarnya tetap 340px - bilahnya menyingkir supaya tidak
		   menindih judul panel yang sedang terbuka. */
		<div className={cn('absolute top-4 z-40', activePanel === null ? 'right-24' : 'right-[28rem]')}>
			<SearchPopup
				controls={controls}
				focusTick={focusTick}
				onOpenPanel={openPanelSearch}
				onClose={closeSearch}
			/>
		</div>
	)
}
