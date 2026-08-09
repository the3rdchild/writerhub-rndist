import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getMemory, putMemory } from './api'
import type { MemoryPreferences } from './types'

export const MEMORY_QUERY_KEY = ['memory'] as const

/**
 * AI Memory dari server. Sengaja TIDAK menumpang `useSettings()` /
 * `usePersistentState` (localStorage): preferensi ini dipakai server saat
 * menyusun prompt, jadi sumber kebenarannya harus server juga - lengkap
 * dengan state memuat/menyimpan/gagal sendiri.
 */
export function useMemory() {
	return useQuery({
		queryKey: MEMORY_QUERY_KEY,
		queryFn: getMemory,
		staleTime: 0,
	})
}

/**
 * Simpan lewat tombol "Simpan" eksplisit - bukan autosave per ketukan seperti
 * setting lain. Galatnya wajib ditampilkan: preferensi yang dikira tersimpan
 * padahal tidak jauh lebih buruk daripada tombol simpan yang membosankan.
 */
export function useSaveMemory() {
	const queryClient = useQueryClient()
	return useMutation({
		mutationFn: (preferences: MemoryPreferences) => putMemory(preferences),
		onSuccess: (data) => queryClient.setQueryData(MEMORY_QUERY_KEY, data),
	})
}
