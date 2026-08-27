import { useQuery, useQueryClient } from '@tanstack/react-query'
import { listProjects } from './api'

export const PROJECTS_QUERY_KEY = ['projects'] as const

export function useProjects() {
	return useQuery({
		queryKey: PROJECTS_QUERY_KEY,
		queryFn: listProjects,
		staleTime: 0,
	})
}

export function useInvalidateProjects() {
	const queryClient = useQueryClient()
	return () => queryClient.invalidateQueries({ queryKey: PROJECTS_QUERY_KEY })
}
