import { useQuery, useQueryClient } from '@tanstack/react-query'
import { listDocuments } from './api'

export const DOCUMENTS_QUERY_KEY = ['documents'] as const

/** Daftar dokumen di cloud untuk halaman /library. */
export function useDocuments() {
	return useQuery({
		queryKey: DOCUMENTS_QUERY_KEY,
		queryFn: () => listDocuments(),
		// Daftar bisa berubah karena autosave di tab lain; tidak boleh abadi.
		staleTime: 0,
	})
}

/**
 * Segarkan daftar dokumen setelah mutasi (create/update/delete).
 * Sengaja promise sederhana, bukan `useMutation`: titik mutasinya tersebar
 * (sync context, kartu library) dan yang penting hanya cache-nya ikut ditarik.
 */
export function useInvalidateDocuments() {
	const queryClient = useQueryClient()
	return () => queryClient.invalidateQueries({ queryKey: DOCUMENTS_QUERY_KEY })
}
