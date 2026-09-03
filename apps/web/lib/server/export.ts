import 'server-only'

import type { SuccessResponse } from '@writer-hub/shared'
import { cache } from 'react'
import type { ExportPayload } from '@/features/export/types'
import { callUpstream } from './upstream'

/**
 * Membaca dokumen di balik satu tautan ekspor bertanda tangan.
 *
 * Sebangun dengan `getSharedDocument`, termasuk cara gagalnya: setiap kegagalan
 * mengembalikan null dan halaman memperlakukan semuanya sebagai tidak
 * ditemukan. Membedakan "tanda tangan salah" dari "dokumen tidak ada" justru
 * memberi tahu penebak mana yang benar-benar ada.
 */
export const getExportDocument = cache(
	async (documentId: string, exp: string, sig: string): Promise<ExportPayload | null> => {
		if (!documentId || !exp || !sig) return null

		try {
			const query = `exp=${encodeURIComponent(exp)}&sig=${encodeURIComponent(sig)}`
			const response = await callUpstream({
				path: `/api/v1/exports/${encodeURIComponent(documentId)}?${query}`,
				method: 'GET',
			})
			if (!response.ok) return null

			const body = (await response.json()) as SuccessResponse<ExportPayload>
			return body.data ?? null
		} catch {
			return null
		}
	},
)
