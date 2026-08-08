import { apiFetch } from '@/lib/api-client'
import type { RestoreVersionResult, VersionDetail, VersionSummary } from './types'

/** Daftar versi satu dokumen, terbaru di atas. */
export function listVersions(documentId: string): Promise<VersionSummary[]> {
	return apiFetch<VersionSummary[]>(`/documents/${encodeURIComponent(documentId)}/versions`)
}

/** Baca satu versi beserta naskahnya untuk pratinjau. */
export function getVersion(documentId: string, versionId: string): Promise<VersionDetail> {
	return apiFetch<VersionDetail>(
		`/documents/${encodeURIComponent(documentId)}/versions/${encodeURIComponent(versionId)}`,
	)
}

/** Bekukan keadaan dokumen saat ini sebagai versi manual berlabel. */
export function createVersion(documentId: string, label?: string): Promise<VersionSummary> {
	return apiFetch<VersionSummary>(`/documents/${encodeURIComponent(documentId)}/versions`, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(label ? { label } : {}),
	})
}

/** Pulihkan dokumen ke versi lampau; server menyimpan dulu versi pre-restore. */
export function restoreVersion(documentId: string, versionId: string): Promise<RestoreVersionResult> {
	return apiFetch<RestoreVersionResult>(
		`/documents/${encodeURIComponent(documentId)}/versions/${encodeURIComponent(versionId)}/restore`,
		{ method: 'POST' },
	)
}
