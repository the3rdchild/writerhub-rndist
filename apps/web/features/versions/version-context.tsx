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
import { getLocalVersion } from './local-store'
import {
	maybeSnapshotLocalInterval,
	rememberLocalSnapshot,
	snapshotLocalVersion,
} from './local-snapshot'
import { VERSIONS_QUERY_KEY } from './use-versions'

/**
 * Mode layar penuh "Riwayat versi" (§3.3 rencana).
 *
 * Saat `versionMode` terisi, workspace digantikan oleh `VersionHistoryView` -
 * bukan overlay, supaya editor utama ikut lepas dan kembali lagi terasa instan
 * karena state sesi tetap di memori.
 *
 * Provider ini hidup di dalam `SyncProvider`: membuka mode butuh linkage tab →
 * tab server, alur restore cloud butuh `saveToCloud` untuk flush terakhir,
 * dan snapshot interval lokal butuh linkage untuk tahu tab aktif masih lokal.
 */
export interface VersionMode {
	tabId: string
	/** `null` = sumber lokal (IndexedDB); selain itu = id tab di server (API). */
	serverTabId: string | null
	title: string
}

interface VersionContextValue {
	versionMode: VersionMode | null
	openVersionMode: (mode: VersionMode) => void
	closeVersionMode: () => void
	/**
	 * Pulihkan tab ke versi lampau, lengkap dari snapshot pre-restore sampai
	 * menutup mode. Melempar Error bila salah satu langkah gagal - pemanggil
	 * yang menampilkan pesannya.
	 */
	restoreToVersion: (versionId: string) => Promise<void>
}

const VersionContext = createContext<VersionContextValue | null>(null)

export function VersionProvider({ children }: { children: ReactNode }) {
	const { doc, activeId } = useSessions()
	const { linkage, saveToCloud } = useSync()
	const queryClient = useQueryClient()
	const [versionMode, setVersionMode] = useState<VersionMode | null>(null)

	// Handler Yjs didaftarkan sekali; nilai terkini dibaca lewat ref.
	const activeIdRef = useRef(activeId)
	activeIdRef.current = activeId
	const linkageRef = useRef(linkage)
	linkageRef.current = linkage

	const openVersionMode = useCallback((mode: VersionMode) => setVersionMode(mode), [])
	const closeVersionMode = useCallback(() => setVersionMode(null), [])

	// Snapshot interval untuk tab lokal aktif (Iterasi 2). Blacklist origin sama
	// dengan sync-context: tulisan dari sync/restore (SYNC_ORIGIN) dan hidrasi
	// IndexedDB bukan suntingan user.
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

			// Jalur lokal: bekukan draf sekarang sebagai pre_restore, lalu timpa
			// fragmen dengan naskah versi. Tanpa flush/cloud sama sekali.
			if (versionMode.serverTabId === null) {
				const target = await getLocalVersion(versionMode.tabId, versionId)
				if (!target) throw new Error('Versi tidak ditemukan')

				await snapshotLocalVersion(doc, versionMode.tabId, 'pre_restore')
				doc.transact(() => jsonToFragment(doc, versionMode.tabId, target.content), SYNC_ORIGIN)
				// Cache snapshot menunjuk konten hasil restore, bukan draf lama,
				// supaya perbandingan interval berikutnya tidak keliru.
				rememberLocalSnapshot(versionMode.tabId, Date.now(), JSON.stringify(target.content))

				await queryClient.invalidateQueries({
					queryKey: [...VERSIONS_QUERY_KEY, 'local', versionMode.tabId],
				})
				setVersionMode(null)
				return
			}

			// Flush dulu: versi pre-restore yang dibuat server harus membekukan
			// keadaan terkini, bukan autosave terakhir. Melanjutkan setelah flush
			// gagal berarti suntingan terakhir user hilang tanpa jejak.
			const flushed = await saveToCloud(activeId)
			if (!flushed) {
				throw new Error('Draf terkini gagal disimpan ke cloud, pemulihan dibatalkan.')
			}

			await restoreVersion(versionMode.serverTabId, versionId)
			// Konten terkini dibaca dari TAB-nya, bukan dokumen induk - versi
			// memang melekat per tab.
			const fresh = await getTab(versionMode.serverTabId)

			// jsonToFragment mengunci LOCAL_ORIGIN di transaksinya sendiri; tanpa
			// bungkusan ini tulisan server terbaca sebagai suntingan user dan
			// autosave langsung mengirim PUT balik atas naskah yang sama.
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
