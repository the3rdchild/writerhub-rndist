'use client'

import type { AnalysisFeature, AnalysisResultData, GrammarResultPayload } from '@writer-hub/shared'
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
import { canOpenInPanel, canReapply, panelForFeature, remapResult, tabPlainText } from './reapply'
import type { HistoryDetail } from './types'

export interface ReapplyController {
	documentReady: boolean
	opening: boolean
	openError: string | null
	openTargetDocument: () => Promise<void>
	reapply: () => void
}

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
	const documentReady = !detail?.tabId || detail.tabId === activeServerId

	const openTargetDocument = useCallback(async () => {
		if (!detail?.tabId) return
		setOpening(true)
		setOpenError(null)
		try {
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
		if (!detail?.result || !canOpenInPanel(detail.feature) || !activeId || !documentReady) return

		const text = tabPlainText(doc, activeId)

		if (detail.feature === 'grammar') {
			const result = detail.result as GrammarResultPayload
			setTabResults(activeId, {
				suggestions: reconcileSuggestions(text, result.suggestions ?? []),
				scores: result.scores ?? null,
			})
		} else {
			const feature = detail.feature as AnalysisFeature
			const remapped = remapResult(feature, detail.result as AnalysisResultData, text)
			markRun(feature, {
				text,
				offset: 0,
				scoped: false,
				language: language.code,
				tabId: detail.tabId ?? undefined,
			})
			queryClient.setQueryData(['analysis', feature, fingerprint(text), 0, language.code], remapped)
		}

		setActivePanel(panelForFeature(detail.feature))
		router.push('/')
	}, [
		detail,
		activeId,
		documentReady,
		doc,
		language.code,
		markRun,
		queryClient,
		router,
		setActivePanel,
		setTabResults,
	])

	return { documentReady, opening, openError, openTargetDocument, reapply }
}

export { canReapply }
