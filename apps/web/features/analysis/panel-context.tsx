'use client'

import type { AnalysisFeature, RewriterTone } from '@writer-hub/shared'
import { createContext, type ReactNode, useCallback, useContext, useMemo, useState } from 'react'
export type PanelId = 'proofreader' | 'ai_chat' | 'comments' | AnalysisFeature

export interface AnalysisRun {
	text: string
	offset: number
	scoped: boolean
	language: string
	tabId?: string
	tone?: RewriterTone
	targetLang?: string
}

type LastRunMap = Partial<Record<AnalysisFeature, AnalysisRun>>

interface PanelContextValue {
	activePanel: PanelId | null
	setActivePanel: (panel: PanelId | null) => void
	togglePanel: (panel: PanelId) => void
	lastRun: LastRunMap
	markRun: (feature: AnalysisFeature, run: AnalysisRun) => void
	clearRun: (feature: AnalysisFeature) => void
}

const PanelContext = createContext<PanelContextValue | null>(null)

export function PanelProvider({ children }: { children: ReactNode }) {
	const [activePanel, setActivePanel] = useState<PanelId | null>('ai_chat')
	const [lastRun, setLastRun] = useState<LastRunMap>({})

	const togglePanel = useCallback((panel: PanelId) => {
		setActivePanel((current) => (current === panel ? null : panel))
	}, [])

	const markRun = useCallback((feature: AnalysisFeature, run: AnalysisRun) => {
		setLastRun((current) => ({ ...current, [feature]: run }))
	}, [])

	const clearRun = useCallback((feature: AnalysisFeature) => {
		setLastRun((current) => {
			if (current[feature] === undefined) return current
			const next = { ...current }
			delete next[feature]
			return next
		})
	}, [])

	const value = useMemo(
		() => ({ activePanel, setActivePanel, togglePanel, lastRun, markRun, clearRun }),
		[activePanel, togglePanel, lastRun, markRun, clearRun],
	)

	return <PanelContext.Provider value={value}>{children}</PanelContext.Provider>
}

export function usePanels(): PanelContextValue {
	const context = useContext(PanelContext)
	if (!context) throw new Error('usePanels harus dipakai di dalam <PanelProvider>')
	return context
}
