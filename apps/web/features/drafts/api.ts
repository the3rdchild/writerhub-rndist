import type { DraftHandoff } from '@writer-hub/shared'
import { apiFetch } from '@/lib/api-client'

/**
 * Status draf yang dititipkan klien eksternal. Dokumennya sudah ada sejak
 * tautan dibalas; yang ditanyakan di sini hanya apakah naskahnya sudah ditulis.
 */
export function getDraftStatus(documentId: string): Promise<DraftHandoff> {
	return apiFetch<DraftHandoff>(`/drafts/${encodeURIComponent(documentId)}`)
}
