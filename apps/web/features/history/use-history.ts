import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { clearHistory, deleteHistoryEntry, getHistoryEntry, listHistory } from './api'
import type { HistoryFeature } from './types'

export const HISTORY_QUERY_KEY = ['history'] as const

const PAGE_SIZE = 50

/**
 * Daftar aktivitas AI untuk halaman /activity, dipaginasi keyset (cursor =
 * createdAt entri terakhir). Daftar bisa berubah karena job baru dari tab lain,
 * jadi tidak boleh abadi.
 */
export function useHistory(feature?: HistoryFeature) {
	return useInfiniteQuery({
		queryKey: [...HISTORY_QUERY_KEY, feature ?? 'all'],
		queryFn: ({ pageParam }) => listHistory({ feature, cursor: pageParam, limit: PAGE_SIZE }),
		initialPageParam: undefined as number | undefined,
		getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
		staleTime: 0,
	})
}

/** Detail satu entri (hasil lengkap), dimuat saat entri dipilih. */
export function useHistoryEntry(jobId: string | null) {
	return useQuery({
		queryKey: [...HISTORY_QUERY_KEY, 'detail', jobId],
		queryFn: () => getHistoryEntry(jobId as string),
		enabled: jobId !== null,
		staleTime: Number.POSITIVE_INFINITY,
	})
}

/** Hapus satu entri, lalu segarkan daftar. */
export function useDeleteHistoryEntry() {
	const queryClient = useQueryClient()
	return useMutation({
		mutationFn: (jobId: string) => deleteHistoryEntry(jobId),
		onSuccess: () => queryClient.invalidateQueries({ queryKey: HISTORY_QUERY_KEY }),
	})
}

/** "Hapus semua aktivitas", lalu segarkan daftar. */
export function useClearHistory() {
	const queryClient = useQueryClient()
	return useMutation({
		mutationFn: () => clearHistory(),
		onSuccess: () => queryClient.invalidateQueries({ queryKey: HISTORY_QUERY_KEY }),
	})
}
