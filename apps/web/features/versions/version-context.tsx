'use client'

import { useQueryClient } from '@tanstack/react-query'
import {
	createContext,
	type ReactNode,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useRef,
	useState,
} from 'react'
import { IndexeddbPersistence } from 'y-indexeddb'
import { getTab } from '@/features/documents/api'
import { DOCUMENTS_QUERY_KEY } from '@/features/documents/use-documents'
import { useSessions } from '@/features/sessions/session-context'
import { jsonToFragment } from '@/features/sync/serialize'
import { SYNC_ORIGIN, useSync } from '@/features/sync/sync-context'
import { restoreVersion } from './api'
import { maybeSnapshotLocalInterval, rememberLocalSnapshot, snapshotLocalVersion } from './local-snapshot'
import { getLocalVersion } from './local-store'
import { VERSIONS_QUERY_KEY } from './use-versions'

export interface VersionMode {
	tabId: string
	serverTabId: string | null
	title: string
}

interface VersionContextValue {
	versionMode: VersionMode | null
	openVersionMode: (mode: VersionMode) => void
	closeVersionMode: () => void
	restoreToVersion: (versionId: string) => Promise<void>
}

const VersionContext = createContext<VersionContextValue | null>(null)

export function VersionProvider({ children }: { children: ReactNode }) {
	const { doc, activeId } = useSessions()
	const { linkage, saveToCloud } = useSync()
	const queryClient = useQueryClient()
	const [versionMode, setVersionMode] = useState<VersionMode | null>(null)
	const activeIdRef = useRef(activeId)
	activeIdRef.current = activeId
	const linkageRef = useRef(linkage)
	linkageRef.current = linkage

	const openVersionMode = useCallback((mode: VersionMode) => setVersionMode(mode), [])
	const closeVersionMode = useCallback(() => setVersionMode(null), [])
	useEffect(() => {
		const onUpdate = (_update: Uint8Array, origin: unknown) => {
			if (origin === SYNC_ORIGIN || origin instanceof IndexeddbPersistence) return
			const tabId = activeIdRef.current
			if (!tabId || linkageRef.current[tabId]) return
			void maybeSnapshotLocalInterval(doc, tabId)
				.then((inserted) => {
					if (inserted) {
						void queryClient.invalidateQueries({
							queryKey: [...VERSIONS_QUERY_KEY, 'local', tabId],
						})
					}
				})
				.catch(() => {})
		}

		doc.on('update', onUpdate)
		return () => {
			doc.off('update', onUpdate)
		}
	}, [doc, queryClient])

	const restoreToVersion = useCallback(
		async (versionId: string) => {
			if (!versionMode || !activeId) return
			if (versionMode.serverTabId === null) {
				const target = await getLocalVersion(versionMode.tabId, versionId)
				if (!target) throw new Error('Versi tidak ditemukan')

				await snapshotLocalVersion(doc, versionMode.tabId, 'pre_restore')
				doc.transact(() => jsonToFragment(doc, versionMode.tabId, target.content), SYNC_ORIGIN)
				rememberLocalSnapshot(versionMode.tabId, Date.now(), JSON.stringify(target.content))

				await queryClient.invalidateQueries({
					queryKey: [...VERSIONS_QUERY_KEY, 'local', versionMode.tabId],
				})
				setVersionMode(null)
				return
			}
			const flushed = await saveToCloud(activeId)
			if (!flushed) {
				throw new Error('Draf terkini gagal disimpan ke cloud, pemulihan dibatalkan.')
			}

			await restoreVersion(versionMode.serverTabId, versionId)
			const fresh = await getTab(versionMode.serverTabId)
			doc.transact(() => jsonToFragment(doc, activeId, fresh.content), SYNC_ORIGIN)

			await Promise.all([
				queryClient.invalidateQueries({ queryKey: [...VERSIONS_QUERY_KEY, versionMode.serverTabId] }),
				queryClient.invalidateQueries({ queryKey: DOCUMENTS_QUERY_KEY }),
			])
			setVersionMode(null)
		},
		[versionMode, activeId, saveToCloud, doc, queryClient],
	)

	const value = useMemo<VersionContextValue>(
		() => ({ versionMode, openVersionMode, closeVersionMode, restoreToVersion }),
		[versionMode, openVersionMode, closeVersionMode, restoreToVersion],
	)

	return <VersionContext.Provider value={value}>{children}</VersionContext.Provider>
}

export function useVersionMode(): VersionContextValue {
	const context = useContext(VersionContext)
	if (!context) throw new Error('useVersionMode harus dipakai di dalam <VersionProvider>')
	return context
}
