'use client'

import { useCallback, useEffect, useState } from 'react'
import * as Y from 'yjs'
import {
	DEFAULT_PAGE_SETUP,
	type PageMargins,
	type PageOrientation,
	type PageSetup,
	type PageSizeId,
} from '@/features/editor/page-geometry'
import { useSessions } from '@/features/sessions/session-context'
import {
	migratePageSetup,
	resolvePageSetup,
	setPageSetupForDoc,
	setPageSetupForTab,
} from '@/features/sessions/ydoc'
import { useSettings } from '@/features/settings/settings-context'

export function usePageSetup(): {
	setup: PageSetup
	setPageSetup: (setup: PageSetup, scope: 'document' | 'tab') => void
} {
	const { doc, activeTabId, activeDocId, hydrated } = useSessions()
	const { settings } = useSettings()

	const compute = useCallback((): PageSetup => {
		if (!activeTabId) return settings.defaultPageSetup
		return resolvePageSetup(doc, activeTabId, settings.defaultPageSetup)
	}, [doc, activeTabId, settings.defaultPageSetup])

	const [setup, setSetup] = useState<PageSetup>(compute)
	useEffect(() => {
		setSetup(compute())
	}, [compute])
	useEffect(() => {
		if (!hydrated || !activeDocId) return
		migratePageSetup(doc, activeDocId, settings.defaultPageSetup)
	}, [hydrated, activeDocId, doc, settings.defaultPageSetup])
	useEffect(() => {
		if (!activeTabId) return
		const tabsMeta = doc.getMap('tabs').get('meta') as Y.Map<Y.Map<unknown>> | undefined
		const docsMeta = doc.getMap('docs').get('meta') as Y.Map<Y.Map<unknown>> | undefined

		const observe = () => setSetup(compute())
		tabsMeta?.observeDeep(observe)
		docsMeta?.observeDeep(observe)
		return () => {
			tabsMeta?.unobserveDeep(observe)
			docsMeta?.unobserveDeep(observe)
		}
	}, [doc, activeTabId, compute])

	const setPageSetup = useCallback(
		(next: PageSetup, scope: 'document' | 'tab') => {
			if (scope === 'document' && activeDocId) setPageSetupForDoc(doc, activeDocId, next)
			else if (scope === 'tab' && activeTabId) setPageSetupForTab(doc, activeTabId, next)
		},
		[doc, activeDocId, activeTabId],
	)

	return { setup, setPageSetup }
}

export function pageSetupFromLegacy(
	size: PageSizeId,
	orientation: PageOrientation,
	margins: PageMargins,
): PageSetup {
	return { ...DEFAULT_PAGE_SETUP, size, orientation, margins }
}
