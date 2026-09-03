import { z } from 'zod'

export const uploadAssetBodySchema = z.object({
	projectId: z.uuid(),
	name: z.string().trim().min(1).max(255).optional(),
	/**
	 * Ukuran hakiki gambar. Dikirim klien karena di sanalah ia gratis - peramban
	 * sudah memuat gambarnya untuk pratinjau - sementara mengukurnya di server
	 * berarti menambah pustaka pengurai gambar demi dua angka.
	 */
	width: z.coerce.number().int().positive().max(20000).optional(),
	height: z.coerce.number().int().positive().max(20000).optional(),
})

export const mintAssetUrlsBodySchema = z.object({
	ids: z.array(z.uuid()).min(1).max(100),
	/** Ada berarti pemintanya pemegang share link, bukan pemilik proyek. */
	shareToken: z.string().trim().min(1).max(255).optional(),
})

export const setDocumentAssetsBodySchema = z.object({
	documentId: z.uuid(),
	ids: z.array(z.uuid()).max(500),
})

export interface AssetSummary {
	id: string
	projectId: string
	name: string
	mime: string
	bytes: number
	width: number | null
	height: number | null
	createdAt: number
}

export interface AssetUrl {
	id: string
	url: string
	/** Epoch detik. Klien memakainya untuk menerbitkan ulang sebelum gambar mati. */
	expiresAt: number
}

export interface UploadAssetResponse extends AssetSummary {
	/** Bagian yang dibuang pembersih SVG, kalau ada - supaya pengunggah tahu. */
	sanitized?: string[]
	/** Benar kalau berkas identik sudah ada dan barisnya dipakai ulang. */
	deduplicated?: boolean
}
