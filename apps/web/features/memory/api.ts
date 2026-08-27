import { apiFetch } from '@/lib/api-client'
import type { MemoryPreferences } from './types'

export function getMemory(): Promise<MemoryPreferences> {
	return apiFetch<MemoryPreferences>('/memory')
}

export function putMemory(preferences: MemoryPreferences): Promise<MemoryPreferences> {
	return apiFetch<MemoryPreferences>('/memory', {
		method: 'PUT',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(preferences),
	})
}
