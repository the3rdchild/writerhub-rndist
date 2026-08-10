'use client'

import type { AnalysisFeature, GrammarResultPayload } from '@writer-hub/shared'
import { useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { useCallback, useState } from 'react'
import { usePanels } from '@/features/analysis/panel-context'
import { useDocumentLanguage } from '@/features/document/use-language'
import { reconcileSuggestions } from '@/features/document/suggestions'
import { getDocument, getTab } from '@/features/documents/api'
import { useSessions } from '@/features/sessions/session-context'
import { useSync } from '@/features/sync/sync-context'
import { fingerprint } from '@/lib/utils'
import { canReapply, panelForFeature, remapResult, tabPlainText } from './reapply'
import type { HistoryDetail } from './types'

export interface ReapplyController {
	/** Tab tujuan entri adalah tab yang sedang aktif. */
	documentReady: boolean
	/** Sedang membuka dokumen tujuan. */
	opening: boolean
	/** Galat membuka dokumen (mis. batas tab tercapai). */
	openError: string | null
	/** Buka dokumen tujuan sebagai tab aktif (prasyarat terapkan ulang). */
	openTargetDocument: () => Promise<void>
	/** Dorong hasil ke panel fiturnya lalu kembali ke editor. */
	reapply: () => void
}

/**
 * "Terapkan ulang" Aktivitas AI (§F.4).
 *
 * BUKAN jalur apply baru: hasil lama didorong ke state yang sudah dipakai
 * panel (tabView untuk grammar, cache query + lastRun untuk analisis), panel
 * fiturnya dibuka, dan pengguna memakai alur apply yang sudah ada
 * (ChangeListPanel / apply-text). Offset lama dipetakan ulang lewat
 * resolveSpan sebelum didorong - lihat remapResult.
 *
 * Prasyarat: tab tujuan = tab aktif. Entri dengan tabId berbeda harus
 * membuka dokumennya dulu (openTargetDocument); tidak ada penerapan lintas
 * dokumen.
 */
export function useReapply(detail: HistoryDetail | null): ReapplyController {
	const router = useRouter()
	const queryClient = useQueryClient()
	const { doc, activeId, setTabResults } = useSessions()
	const { linkage, openFromLibrary } = useSync()
	const { markRun, setActivePanel } = usePanels()
	const language = useDocumentLanguage()

	const [opening, setOpening] = useState(false)
	const [openError, setOpenError] = useState<string | null>(null)

	const activeServerId = activeId ? linkage[activeId]?.serverId : undefined
	// Entri tanpa tautan (tab lokal / tabnya sudah dihapus) diterapkan ke tab
	// yang sedang aktif - tidak ada identitas tab lain untuk dilanggar.
	const documentReady = !detail?.tabId || detail.tabId === activeServerId

	const openTargetDocument = useCallback(async () => {
		if (!detail?.tabId) return
		setOpening(true)
		setOpenError(null)
		try {
			// Entri hanya membawa id tab; induknya diambil dulu supaya seluruh
			// tab dokumennya ikut terbuka.
			const tab = await getTab(detail.tabId)
			const document = await getDocument(tab.documentId)
			const tabId = await openFromLibrary(document)
			if (!tabId) setOpenError('Batas tab tercapai - tutup satu tab dulu.')
		} catch {
			setOpenError('Gagal membuka dokumen.')
		} finally {
			setOpening(false)
		}
	}, [detail?.tabId, openFromLibrary])

	const reapply = useCallback(() => {
		if (!detail?.result || !detail.feature || !activeId || !documentReady) return

		const text = tabPlainText(doc, activeId)

		if (detail.feature === 'grammar') {
			// Hasil grammar ditulis ke tabView SEBELUM navigasi; efek muat tab di
			// session-context mengangkatnya ke state dokumen begitu editor kembali
			// terpasang, jadi tidak ada yang hilang di tengah jalan.
			const result = detail.result as GrammarResultPayload
			setTabResults(activeId, {
				suggestions: reconcileSuggestions(text, result.suggestions ?? []),
				scores: result.scores ?? null,
			})
		} else {
			// Fitur analisis: isi cache query dengan hasil lama (offset sudah
			// dipetakan ulang) dan tandai sebagai lastRun - useAnalysis membacanya
			// dari cache tanpa menjalankan job baru.
			const feature = detail.feature as AnalysisFeature
			const remapped = remapResult(feature, detail.result, text)
			markRun(feature, {
				text,
				offset: 0,
				scoped: false,
				language: language.code,
				tabId: detail.tabId ?? undefined,
			})
			queryClient.setQueryData(
				['analysis', feature, fingerprint(text), 0, language.code],
				remapped,
			)
		}

		setActivePanel(panelForFeature(detail.feature))
		router.push('/')
	}, [detail, activeId, documentReady, doc, language.code, markRun, queryClient, router, setActivePanel, setTabResults])

	return { documentReady, opening, openError, openTargetDocument, reapply }
}

export { canReapply }
