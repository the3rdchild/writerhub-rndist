import { useQuery, useQueryClient } from '@tanstack/react-query'
import { listProjects } from './api'

export const PROJECTS_QUERY_KEY = ['projects'] as const

/** Daftar proyek di cloud untuk sidebar /library. */
export function useProjects() {
	return useQuery({
		queryKey: PROJECTS_QUERY_KEY,
		queryFn: listProjects,
		staleTime: 0,
	})
}

/**
 * Segarkan daftar proyek setelah mutasi (create/update/delete) -
 * pola yang sama dengan `useInvalidateDocuments`.
 */
export function useInvalidateProjects() {
	const queryClient = useQueryClient()
	return () => queryClient.invalidateQueries({ queryKey: PROJECTS_QUERY_KEY })
}
