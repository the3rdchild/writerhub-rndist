'use client'

import { useCallback, useEffect, useState } from 'react'
import type * as Y from 'yjs'
import { useSessions } from '@/features/sessions/session-context'
import type { PageFurniture } from './model'
import { readPageFurniture, setPageFurnitureForTab } from './page-furniture-ydoc'

/**
 * Perabot halaman tab aktif — berlangganan perubahan meta Y.Doc
 * dengan pola yang sama seperti usePageSetup.
 */
export function usePageFurniture(): {
	furniture: PageFurniture | null
	setFurniture: (furniture: PageFurniture | null) => void
} {
	const { doc, activeTabId } = useSessions()

	const compute = useCallback((): PageFurniture | null => {
		if (!activeTabId) return null
		return readPageFurniture(doc, activeTabId)
	}, [doc, activeTabId])

	const [furniture, setFurnitureState] = useState<PageFurniture | null>(compute)
	useEffect(
		function recomputeFurniture() {
			setFurnitureState(compute())
		},
		[compute],
	)
	useEffect(
		function observeFurnitureChanges() {
			if (!activeTabId) return
			const tabsMeta = doc.getMap('tabs').get('meta') as Y.Map<Y.Map<unknown>> | undefined

			const observe = () => setFurnitureState(compute())
			tabsMeta?.observeDeep(observe)
			return () => {
				tabsMeta?.unobserveDeep(observe)
			}
		},
		[doc, activeTabId, compute],
	)

	const setFurniture = useCallback(
		(next: PageFurniture | null) => {
			if (!activeTabId) return
			setPageFurnitureForTab(doc, activeTabId, next ?? { footer: {}, header: {} })
		},
		[doc, activeTabId],
	)

	return { furniture, setFurniture }
}
