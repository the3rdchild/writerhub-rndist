import { apiFetch } from '@/lib/api-client'
import type { HistoryDetail, HistoryFeature, HistoryListResponse } from './types'
export function listHistory(params: {
	feature?: HistoryFeature
	cursor?: number
	limit?: number
}): Promise<HistoryListResponse> {
	const query = new URLSearchParams()
	if (params.feature) query.set('feature', params.feature)
	if (params.cursor) query.set('cursor', String(params.cursor))
	if (params.limit) query.set('limit', String(params.limit))
	const suffix = query.size > 0 ? `?${query.toString()}` : ''
	return apiFetch<HistoryListResponse>(`/history${suffix}`)
}
export function getHistoryEntry(jobId: string): Promise<HistoryDetail> {
	return apiFetch<HistoryDetail>(`/history/${encodeURIComponent(jobId)}`)
}
export function deleteHistoryEntry(jobId: string): Promise<{ deleted: boolean }> {
	return apiFetch<{ deleted: boolean }>(`/history/${encodeURIComponent(jobId)}`, { method: 'DELETE' })
}
export function clearHistory(): Promise<{ deleted: number }> {
	return apiFetch<{ deleted: number }>('/history', { method: 'DELETE' })
}
