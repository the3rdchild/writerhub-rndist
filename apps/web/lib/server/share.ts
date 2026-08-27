import 'server-only'

import type { SuccessResponse } from '@writer-hub/shared'
import { cache } from 'react'
import type { SharePayload } from '@/features/share/types'
import { callUpstream } from './upstream'

/**
 * Membaca dokumen di balik satu token berbagi.
 *
 * Dibungkus cache() supaya generateMetadata dan render halaman berbagi satu
 * permintaan yang sama - tanpa itu keduanya memanggil API dua kali untuk data
 * yang persis sama.
 *
 * Mengembalikan null untuk setiap kegagalan, termasuk token tidak dikenal dan
 * dokumen terbatas yang belum diautentikasi. Halaman memperlakukan semuanya
 * sebagai "tidak ditemukan": membedakannya di sini justru memberi tahu penebak
 * token mana yang benar-benar ada.
 */
export const getSharedDocument = cache(async (token: string): Promise<SharePayload | null> => {
	if (!token) return null

	try {
		const response = await callUpstream({
			path: `/api/v1/shares/${encodeURIComponent(token)}`,
			method: 'GET',
		})
		if (!response.ok) return null

		const body = (await response.json()) as SuccessResponse<SharePayload>
		return body.data ?? null
	} catch {
		return null
	}
})
