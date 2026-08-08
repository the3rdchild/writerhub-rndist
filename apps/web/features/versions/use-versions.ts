import { useQuery, useQueryClient } from '@tanstack/react-query'
import { getVersion, listVersions } from './api'

export const VERSIONS_QUERY_KEY = ['versions'] as const

/** Lini masa versi satu dokumen; hanya dijalankan selama mode riwayat terbuka. */
export function useVersions(documentId: string | null) {
	return useQuery({
		queryKey: [...VERSIONS_QUERY_KEY, documentId],
		queryFn: () => listVersions(documentId as string),
		enabled: documentId !== null,
		// Versi interval bisa tercipta kapan saja lewat autosave; tidak boleh abadi.
		staleTime: 0,
	})
}

/** Naskah satu versi untuk pratinjau; `null` berarti "Versi saat ini" terpilih. */
export function useVersion(documentId: string | null, versionId: string | null) {
	return useQuery({
		queryKey: [...VERSIONS_QUERY_KEY, documentId, versionId],
		queryFn: () => getVersion(documentId as string, versionId as string),
		enabled: documentId !== null && versionId !== null,
		// Naskah versi immutable; cukup diambil sekali.
		staleTime: Number.POSITIVE_INFINITY,
	})
}

/**
 * Segarkan lini masa setelah mutasi (create manual / restore).
 * Pola yang sama dengan `useInvalidateDocuments`: titik mutasinya tersebar dan
 * yang penting hanya cache-nya ikut ditarik. Kunci detail versi ikut terkena
 * karena ia berawalan kunci daftar.
 */
export function useInvalidateVersions() {
	const queryClient = useQueryClient()
	return (documentId: string) =>
		queryClient.invalidateQueries({ queryKey: [...VERSIONS_QUERY_KEY, documentId] })
}
