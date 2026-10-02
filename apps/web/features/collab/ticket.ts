import type { CollabTicket } from '@writer-hub/shared'
import { apiFetch } from '@/lib/api-client'

/**
 * Tiket websocket kolaborasi lewat BFF (`app/api/collab/ticket`). Tiket berumur
 * pendek (±60 dtk) dan hanya untuk MEMBUKA sambungan; sesi meminta yang baru
 * setiap kali menyambung ulang setelah ia hampir habis.
 */
export function fetchCollabTicket(tabId: string, shareToken?: string): Promise<CollabTicket> {
	return apiFetch<CollabTicket>('/collab/ticket', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ tabId, ...(shareToken ? { shareToken } : {}) }),
	})
}
