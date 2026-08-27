'use client'

import { useCallback, useRef } from 'react'
import { useSessions } from '@/features/sessions/session-context'
import { useSync } from '@/features/sync/sync-context'
import { createVersion } from '@/features/versions/api'

export function usePreTranslateSnapshot() {
	const { activeId } = useSessions()
	const { linkage } = useSync()
	const taken = useRef<string | null>(null)

	const reset = useCallback(() => {
		taken.current = null
	}, [])

	const ensureSnapshot = useCallback(() => {
		const tabId = activeId ? linkage[activeId]?.serverId : undefined
		if (!tabId || taken.current === tabId) return

		taken.current = tabId
		void createVersion(tabId, 'Sebelum terjemahan', 'pre_translate').catch(() => {
			taken.current = null
		})
	}, [activeId, linkage])

	return { ensureSnapshot, reset }
}
