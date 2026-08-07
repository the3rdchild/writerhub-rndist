import { apiFetch } from '@/lib/api-client'
import type { CreateShareInput, CreateShareResult, SharePayload } from './types'

/** Buat share link baru di backend. */
export function createShare(input: CreateShareInput): Promise<CreateShareResult> {
	return apiFetch<CreateShareResult>('/shares', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(input),
	})
}

/** Baca dokumen yang dibagikan lewat token. */
export function fetchShare(token: string): Promise<SharePayload> {
	return apiFetch<SharePayload>(`/shares/${encodeURIComponent(token)}`)
}
