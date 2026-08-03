'use client'

import type { AnalysisFeature } from '@writer-hub/shared'
import { createContext, type ReactNode, useCallback, useContext, useMemo, useState } from 'react'

/** Panel proofreader memakai hasil grammar check, bukan endpoint analisis. */
export type PanelId = 'proofreader' | AnalysisFeature

type LastRunMap = Partial<Record<AnalysisFeature, string>>

interface PanelContextValue {
	/** null berarti panel samping tertutup. */
	activePanel: PanelId | null
	setActivePanel: (panel: PanelId | null) => void
	togglePanel: (panel: PanelId) => void

	/**
	 * Teks yang terakhir dikirim per fitur. Disimpan di sini — bukan di dalam
	 * panel — supaya hasil tidak hilang saat pengguna berpindah panel, dan
	 * supaya status "hasil sudah basi" bisa dihitung dengan membandingkannya ke
	 * isi dokumen sekarang.
	 */
	lastRunText: LastRunMap
	markRun: (feature: AnalysisFeature, text: string) => void
}

const PanelContext = createContext<PanelContextValue | null>(null)

export function PanelProvider({ children }: { children: ReactNode }) {
	const [activePanel, setActivePanel] = useState<PanelId | null>('proofreader')
	const [lastRunText, setLastRunText] = useState<LastRunMap>({})

	const togglePanel = useCallback((panel: PanelId) => {
		setActivePanel((current) => (current === panel ? null : panel))
	}, [])

	const markRun = useCallback((feature: AnalysisFeature, text: string) => {
		setLastRunText((current) => ({ ...current, [feature]: text }))
	}, [])

	const value = useMemo(
		() => ({ activePanel, setActivePanel, togglePanel, lastRunText, markRun }),
		[activePanel, togglePanel, lastRunText, markRun],
	)

	return <PanelContext.Provider value={value}>{children}</PanelContext.Provider>
}

export function usePanels(): PanelContextValue {
	const context = useContext(PanelContext)
	if (!context) throw new Error('usePanels harus dipakai di dalam <PanelProvider>')
	return context
}
