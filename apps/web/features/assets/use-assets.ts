'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useDocuments } from '@/features/documents/use-documents'
import { useSessions } from '@/features/sessions/session-context'
import { useSync } from '@/features/sync/sync-context'
import { deleteAsset, listAssets, mintAssetUrls, readImageSize, uploadAsset } from './api'

export const ASSETS_QUERY_KEY = 'assets'

/**
 * Proyek pemilik dokumen yang sedang dibuka.
 *
 * Aset dimiliki proyek, bukan dokumen - itu yang membuatnya jadi pustaka yang
 * bisa dipakai ulang. Tapi yang diketahui editor hanyalah dokumen lokal di
 * Y.Doc, jadi proyeknya harus dicari lewat dua lompatan: id lokal ke id server
 * (`useSync`), lalu id server ke barisnya di daftar dokumen.
 *
 * `null` berarti belum ada yang bisa ditanya - dokumen belum dibuka, atau
 * belum tersinkron ke server. Itu keadaan yang wajar, bukan galat.
 */
export function useActiveProjectId(): string | null {
	const { activeDocId } = useSessions()
	const { serverDocId } = useSync()
	const documents = useDocuments()

	const remoteId = activeDocId ? serverDocId(activeDocId) : null
	if (!remoteId) return null
	return documents.data?.find((row) => row.id === remoteId)?.projectId ?? null
}

export function useAssets(projectId: string | null) {
	return useQuery({
		queryKey: [ASSETS_QUERY_KEY, projectId],
		queryFn: () => listAssets(projectId as string),
		enabled: projectId !== null,
	})
}

/**
 * URL pratinjau untuk sekumpulan aset.
 *
 * Dipisah dari daftarnya karena umurnya berbeda: barisnya bertahan, URL-nya
 * kedaluwarsa dalam hitungan menit. `staleTime` sengaja jauh lebih pendek dari
 * umur URL-nya supaya gambar tidak pernah mati di layar sambil menunggu
 * penerbitan berikutnya.
 */
export function useAssetUrls(ids: readonly string[]) {
	const key = [...ids].sort().join(',')
	return useQuery({
		queryKey: [ASSETS_QUERY_KEY, 'urls', key],
		queryFn: () => mintAssetUrls(ids),
		enabled: ids.length > 0,
		staleTime: 5 * 60 * 1000,
		refetchInterval: 5 * 60 * 1000,
	})
}

export function useUploadAsset(projectId: string | null) {
	const queryClient = useQueryClient()
	return useMutation({
		mutationFn: async (file: File) => {
			if (!projectId) throw new Error('Belum ada proyek yang aktif')
			return uploadAsset(projectId, file, await readImageSize(file))
		},
		onSuccess: () => queryClient.invalidateQueries({ queryKey: [ASSETS_QUERY_KEY, projectId] }),
	})
}

export function useDeleteAsset(projectId: string | null) {
	const queryClient = useQueryClient()
	return useMutation({
		mutationFn: (id: string) => deleteAsset(id),
		onSuccess: () => queryClient.invalidateQueries({ queryKey: [ASSETS_QUERY_KEY, projectId] }),
	})
}
