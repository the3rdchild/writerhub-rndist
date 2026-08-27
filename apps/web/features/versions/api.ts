import { apiFetch } from '@/lib/api-client'
import type { RestoreVersionResult, VersionDetail, VersionSummary } from './types'

export function listVersions(tabId: string): Promise<VersionSummary[]> {
	return apiFetch<VersionSummary[]>(`/tabs/${encodeURIComponent(tabId)}/versions`)
}

export function getVersion(tabId: string, versionId: string): Promise<VersionDetail> {
	return apiFetch<VersionDetail>(
		`/tabs/${encodeURIComponent(tabId)}/versions/${encodeURIComponent(versionId)}`,
	)
}

export function createVersion(
	tabId: string,
	label?: string,
	trigger?: 'manual' | 'pre_translate',
): Promise<VersionSummary> {
	return apiFetch<VersionSummary>(`/tabs/${encodeURIComponent(tabId)}/versions`, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ ...(label ? { label } : {}), ...(trigger ? { trigger } : {}) }),
	})
}

export function restoreVersion(tabId: string, versionId: string): Promise<RestoreVersionResult> {
	return apiFetch<RestoreVersionResult>(
		`/tabs/${encodeURIComponent(tabId)}/versions/${encodeURIComponent(versionId)}/restore`,
		{ method: 'POST' },
	)
}
