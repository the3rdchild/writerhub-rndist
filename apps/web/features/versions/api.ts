import { apiFetch } from '@/lib/api-client'
import type { RestoreVersionResult, VersionDetail, VersionSummary } from './types'

/** Daftar versi satu tab, terbaru di atas. */
export function listVersions(tabId: string): Promise<VersionSummary[]> {
	return apiFetch<VersionSummary[]>(`/tabs/${encodeURIComponent(tabId)}/versions`)
}

/** Baca satu versi beserta naskahnya untuk pratinjau. */
export function getVersion(tabId: string, versionId: string): Promise<VersionDetail> {
	return apiFetch<VersionDetail>(
		`/tabs/${encodeURIComponent(tabId)}/versions/${encodeURIComponent(versionId)}`,
	)
}

/** Bekukan keadaan tab saat ini sebagai versi manual berlabel. */
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

/** Pulihkan tab ke versi lampau; server menyimpan dulu versi pre-restore. */
export function restoreVersion(tabId: string, versionId: string): Promise<RestoreVersionResult> {
	return apiFetch<RestoreVersionResult>(
		`/tabs/${encodeURIComponent(tabId)}/versions/${encodeURIComponent(versionId)}/restore`,
		{ method: 'POST' },
	)
}
