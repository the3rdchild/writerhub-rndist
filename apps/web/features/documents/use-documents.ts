import { useQuery, useQueryClient } from '@tanstack/react-query'
import { listDocuments } from './api'

export const DOCUMENTS_QUERY_KEY = ['documents'] as const

export function useDocuments() {
	return useQuery({
		queryKey: DOCUMENTS_QUERY_KEY,
		queryFn: () => listDocuments(),
		staleTime: 0,
	})
}

export function useInvalidateDocuments() {
	const queryClient = useQueryClient()
	return () => queryClient.invalidateQueries({ queryKey: DOCUMENTS_QUERY_KEY })
}
