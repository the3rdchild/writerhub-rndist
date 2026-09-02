'use client'

import type { DocumentTypography } from '@writer-hub/shared'
import { useCallback, useEffect, useState } from 'react'
import type * as Y from 'yjs'
import { useSessions } from '@/features/sessions/session-context'
import { resolveTypography, setTypographyForDoc, setTypographyForTab } from '@/features/sessions/ydoc'
import { useSettings } from '@/features/settings/settings-context'
import { defaultTypography } from './typography'

/**
 * Tipografi yang berlaku untuk tab yang sedang dibuka, sebangun dengan
 * `usePageSetup`: ia mengikuti perubahan di Y.Doc, jadi tipografi yang datang
 * dari template lewat `applyDocLayout` langsung terpakai tanpa muat ulang.
 */
export function useTypography(): {
	typography: DocumentTypography
	setTypography: (typography: DocumentTypography, scope: 'document' | 'tab') => void
} {
	const { doc, activeTabId, activeDocId } = useSessions()
	const { settings } = useSettings()

	const compute = useCallback((): DocumentTypography => {
		const fallback = defaultTypography(settings.editorFontSize)
		if (!activeTabId) return fallback
		return resolveTypography(doc, activeTabId, fallback)
	}, [doc, activeTabId, settings.editorFontSize])

	const [typography, setState] = useState<DocumentTypography>(compute)
	useEffect(
		function recomputeTypography() {
			setState(compute())
		},
		[compute],
	)
	useEffect(
		function observeTypographyChanges() {
			if (!activeTabId) return
			const tabsMeta = doc.getMap('tabs').get('meta') as Y.Map<Y.Map<unknown>> | undefined
			const docsMeta = doc.getMap('docs').get('meta') as Y.Map<Y.Map<unknown>> | undefined

			const observe = () => setState(compute())
			tabsMeta?.observeDeep(observe)
			docsMeta?.observeDeep(observe)
			return () => {
				tabsMeta?.unobserveDeep(observe)
				docsMeta?.unobserveDeep(observe)
			}
		},
		[doc, activeTabId, compute],
	)

	const setTypography = useCallback(
		(next: DocumentTypography, scope: 'document' | 'tab') => {
			if (scope === 'document' && activeDocId) setTypographyForDoc(doc, activeDocId, next)
			else if (scope === 'tab' && activeTabId) setTypographyForTab(doc, activeTabId, next)
		},
		[doc, activeDocId, activeTabId],
	)

	return { typography, setTypography }
}
