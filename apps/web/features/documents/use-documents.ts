import { useQuery, useQueryClient } from '@tanstack/react-query'
import { listDocuments } from './api'

export const DOCUMENTS_QUERY_KEY = ['documents'] as const

export function useDocuments() {
	return useQuery({
		queryKey: DOCUMENTS_QUERY_KEY,
		queryFn: () => listDocuments(),
		// Daftar dipakai banyak komponen sekaligus (navigasi, library, sync,
		// template), dan dengan staleTime 0 setiap pemasangan dan setiap fokus
		// jendela mengambil ulang seluruhnya. Perubahan dari perangkat ini
		// sudah memperbarui cache secara langsung (sync-context), jadi 30 dtk
		// hanya menunda perubahan dari tempat lain.
		staleTime: 30_000,
	})
}

export function useInvalidateDocuments() {
	const queryClient = useQueryClient()
	return () => queryClient.invalidateQueries({ queryKey: DOCUMENTS_QUERY_KEY })
}
