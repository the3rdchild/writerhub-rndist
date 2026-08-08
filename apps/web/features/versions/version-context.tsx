'use client'

import { useQueryClient } from '@tanstack/react-query'
import { createContext, type ReactNode, useCallback, useContext, useMemo, useState } from 'react'
import { getDocument } from '@/features/documents/api'
import { DOCUMENTS_QUERY_KEY } from '@/features/documents/use-documents'
import { useSessions } from '@/features/sessions/session-context'
import { jsonToFragment } from '@/features/sync/serialize'
import { SYNC_ORIGIN, useSync } from '@/features/sync/sync-context'
import { restoreVersion } from './api'
import { VERSIONS_QUERY_KEY } from './use-versions'

/**
 * Mode layar penuh "Riwayat versi" (§3.3 rencana).
 *
 * Saat `versionMode` terisi, workspace digantikan oleh `VersionHistoryView` -
 * bukan overlay, supaya editor utama ikut lepas dan kembali lagi terasa instan
 * karena state sesi tetap di memori.
 *
 * Provider ini hidup di dalam `SyncProvider`: membuka mode butuh linkage tab →
 * dokumen server, dan alur restore butuh `saveToCloud` untuk flush terakhir.
 */
export interface VersionMode {
	documentId: string
	serverTitle: string
}

interface VersionContextValue {
	versionMode: VersionMode | null
	openVersionMode: (mode: VersionMode) => void
	closeVersionMode: () => void
	/**
	 * Pulihkan tab aktif ke versi lampau, lengkap dari flush sampai menutup
	 * mode. Melempar Error bila salah satu langkah gagal - pemanggil yang
	 * menampilkan pesannya.
	 */
	restoreToVersion: (versionId: string) => Promise<void>
}

const VersionContext = createContext<VersionContextValue | null>(null)

export function VersionProvider({ children }: { children: ReactNode }) {
	const { doc, activeId } = useSessions()
	const { saveToCloud } = useSync()
	const queryClient = useQueryClient()
	const [versionMode, setVersionMode] = useState<VersionMode | null>(null)

	const openVersionMode = useCallback((mode: VersionMode) => setVersionMode(mode), [])
	const closeVersionMode = useCallback(() => setVersionMode(null), [])

	const restoreToVersion = useCallback(
		async (versionId: string) => {
			if (!versionMode || !activeId) return

			// Flush dulu: versi pre-restore yang dibuat server harus membekukan
			// keadaan terkini, bukan autosave terakhir. Melanjutkan setelah flush
			// gagal berarti suntingan terakhir user hilang tanpa jejak.
			const flushed = await saveToCloud(activeId)
			if (!flushed) {
				throw new Error('Draf terkini gagal disimpan ke cloud, pemulihan dibatalkan.')
			}

			await restoreVersion(versionMode.documentId, versionId)
			const fresh = await getDocument(versionMode.documentId)

			// jsonToFragment mengunci LOCAL_ORIGIN di transaksinya sendiri; tanpa
			// bungkusan ini tulisan server terbaca sebagai suntingan user dan
			// autosave langsung mengirim PUT balik atas naskah yang sama.
			doc.transact(() => jsonToFragment(doc, activeId, fresh.content), SYNC_ORIGIN)

			await Promise.all([
				queryClient.invalidateQueries({ queryKey: [...VERSIONS_QUERY_KEY, versionMode.documentId] }),
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
