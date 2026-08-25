import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getMemory, putMemory } from './api'
import type { MemoryPreferences } from './types'

export const MEMORY_QUERY_KEY = ['memory'] as const
export function useMemory() {
	return useQuery({
		queryKey: MEMORY_QUERY_KEY,
		queryFn: getMemory,
		staleTime: 0,
	})
}
export function useSaveMemory() {
	const queryClient = useQueryClient()
	return useMutation({
		mutationFn: (preferences: MemoryPreferences) => putMemory(preferences),
		onSuccess: (data) => queryClient.setQueryData(MEMORY_QUERY_KEY, data),
	})
}
