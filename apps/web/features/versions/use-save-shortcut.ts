'use client'

import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef } from 'react'
import { useSessions } from '@/features/sessions/session-context'
import { useSync } from '@/features/sync/sync-context'
import { snapshotLocalVersion } from './local-snapshot'
import { VERSIONS_QUERY_KEY } from './use-versions'
import { useVersionMode } from './version-context'

/**
 * Ctrl/Cmd+S cerdas sesuai status tab (Iterasi 2 rencana):
 * - Tab terhubung cloud → flush autosave sekarang (`saveToCloud`, PUT).
 * - Tab lokal → snapshot versi lokal trigger `interval` sebagai titik simpan
 *   cepat, tanpa penjaga 10 menit karena ini aksi eksplisit user.
 *
 * Shortcut dilewatkan saat mode riwayat terbuka: di sana tidak ada draf yang
 * bisa disunting, jadi tidak ada yang perlu disimpan.
 */
export function useSaveShortcut(): void {
	const { doc, activeId } = useSessions()
	const { linkage, saveToCloud } = useSync()
	const { versionMode } = useVersionMode()
	const queryClient = useQueryClient()

	// Listener global didaftarkan sekali; nilai terkini dibaca lewat ref.
	const activeIdRef = useRef(activeId)
	activeIdRef.current = activeId
	const linkageRef = useRef(linkage)
	linkageRef.current = linkage
	const saveToCloudRef = useRef(saveToCloud)
	saveToCloudRef.current = saveToCloud
	const versionModeRef = useRef(versionMode)
	versionModeRef.current = versionMode

	useEffect(() => {
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key.toLowerCase() !== 's') return
			if (!(event.ctrlKey || event.metaKey) || event.shiftKey || event.altKey) return
			if (versionModeRef.current) return

			const tabId = activeIdRef.current
			if (!tabId) return
			event.preventDefault()

			if (linkageRef.current[tabId]) {
				void saveToCloudRef.current(tabId)
				return
			}

			void snapshotLocalVersion(doc, tabId, 'interval').then((inserted) => {
				if (inserted) {
					void queryClient.invalidateQueries({
						queryKey: [...VERSIONS_QUERY_KEY, 'local', tabId],
					})
				}
			})
		}

		window.addEventListener('keydown', onKeyDown)
		return () => window.removeEventListener('keydown', onKeyDown)
	}, [doc, queryClient])
}
