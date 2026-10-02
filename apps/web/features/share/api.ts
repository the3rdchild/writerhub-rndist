import { apiFetch } from '@/lib/api-client'
import type { CreateShareInput, CreateShareResult, SharePayload } from './types'

export function createShare(input: CreateShareInput): Promise<CreateShareResult> {
	return apiFetch<CreateShareResult>('/shares', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(input),
	})
}

export function fetchShare(token: string): Promise<SharePayload> {
	return apiFetch<SharePayload>(`/shares/${encodeURIComponent(token)}`)
}

/** Tautan dokumen yang sudah ada, atau null - tidak membuat apa pun. */
export async function fetchCurrentShare(documentId: string): Promise<CreateShareResult | null> {
	const { share } = await apiFetch<{ share: CreateShareResult | null }>(
		`/shares?documentId=${encodeURIComponent(documentId)}`,
	)
	return share
}

export function updateShare(
	token: string,
	patch: Partial<Pick<CreateShareInput, 'access' | 'role'>>,
): Promise<CreateShareResult> {
	return apiFetch<CreateShareResult>(`/shares/${encodeURIComponent(token)}`, {
		method: 'PATCH',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(patch),
	})
}

export function revokeShare(token: string): Promise<{ revoked: boolean }> {
	return apiFetch<{ revoked: boolean }>(`/shares/${encodeURIComponent(token)}`, { method: 'DELETE' })
}
