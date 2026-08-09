'use client'

import type { AnalysisFeature } from '@writer-hub/shared'
import { createContext, type ReactNode, useCallback, useContext, useMemo, useState } from 'react'

/**
 * Panel proofreader memakai hasil grammar check, bukan endpoint analisis, dan
 * ai_chat tidak memakai antrean sama sekali - keduanya tetap panel, jadi id-nya
 * hidup di sini bersama fitur analisis.
 */
export type PanelId = 'proofreader' | 'ai_chat' | 'comments' | AnalysisFeature

/**
 * Apa yang terakhir dikirim ke sebuah fitur.
 *
 * `offset` menampung posisi teks itu di dalam dokumen: nol kalau seluruh naskah
 * yang dianalisis, dan awal seleksi kalau hanya sebagiannya. Worker selalu
 * mengembalikan offset relatif terhadap teks yang ia terima, jadi tanpa angka
 * ini sorotan hasil analisis per-seleksi akan mendarat di awal dokumen.
 */
export interface AnalysisRun {
	text: string
	offset: number
	/** Benar kalau yang dikirim hanya bagian yang disorot pengguna. */
	scoped: boolean
	/** Bahasa naskah, supaya AI menjawab dalam bahasa yang sama. */
	language: string
	/** Dokumen cloud tempat job ini dijalankan, untuk Aktivitas AI. */
	documentId?: string
}

type LastRunMap = Partial<Record<AnalysisFeature, AnalysisRun>>

interface PanelContextValue {
	/** null berarti panel samping tertutup. */
	activePanel: PanelId | null
	setActivePanel: (panel: PanelId | null) => void
	togglePanel: (panel: PanelId) => void

	/**
	 * Permintaan terakhir per fitur. Disimpan di sini - bukan di dalam panel -
	 * supaya hasil tidak hilang saat pengguna berpindah panel, dan supaya status
	 * "hasil sudah basi" bisa dihitung dengan membandingkannya ke isi dokumen
	 * sekarang.
	 */
	lastRun: LastRunMap
	markRun: (feature: AnalysisFeature, run: AnalysisRun) => void
}

const PanelContext = createContext<PanelContextValue | null>(null)

export function PanelProvider({ children }: { children: ReactNode }) {
	const [activePanel, setActivePanel] = useState<PanelId | null>('proofreader')
	const [lastRun, setLastRun] = useState<LastRunMap>({})

	const togglePanel = useCallback((panel: PanelId) => {
		setActivePanel((current) => (current === panel ? null : panel))
	}, [])

	const markRun = useCallback((feature: AnalysisFeature, run: AnalysisRun) => {
		setLastRun((current) => ({ ...current, [feature]: run }))
	}, [])

	const value = useMemo(
		() => ({ activePanel, setActivePanel, togglePanel, lastRun, markRun }),
		[activePanel, togglePanel, lastRun, markRun],
	)

	return <PanelContext.Provider value={value}>{children}</PanelContext.Provider>
}

export function usePanels(): PanelContextValue {
	const context = useContext(PanelContext)
	if (!context) throw new Error('usePanels harus dipakai di dalam <PanelProvider>')
	return context
}
