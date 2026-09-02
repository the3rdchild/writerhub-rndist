import type { DraftHandoff } from '@writer-hub/shared'
import { apiFetch } from '@/lib/api-client'

/**
 * Status draf yang dititipkan klien eksternal. Dokumennya sudah ada sejak
 * tautan dibalas; yang ditanyakan di sini hanya seberapa jauh naskahnya ditulis.
 */
export function getDraftStatus(documentId: string): Promise<DraftHandoff> {
	return apiFetch<DraftHandoff>(`/drafts/${encodeURIComponent(documentId)}`)
}

/**
 * Menulis ulang draf yang gagal ke dokumen yang sama. Permintaan aslinya
 * diambil API dari simpanannya - halaman ini tidak pernah memegang prompt-nya.
 */
export function retryDraft(documentId: string): Promise<DraftHandoff> {
	return apiFetch<DraftHandoff>(`/drafts/${encodeURIComponent(documentId)}/retry`, { method: 'POST' })
}
