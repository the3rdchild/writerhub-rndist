/**
 * Jenis yang diterima `<input type="file">`, disamakan dengan
 * `IMAGE_MIME_TYPES` di API. SVG termasuk, dan ia dibersihkan di server sebelum
 * tersimpan - lihat `lib/svg-sanitize.ts`.
 */
export const IMAGE_ACCEPT = 'image/png,image/jpeg,image/webp,image/gif,image/svg+xml'

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
	/** Epoch detik. URL aset sengaja berumur pendek - lihat `lib/signed-url.ts`. */
	expiresAt: number
}

export interface UploadAssetResult extends AssetSummary {
	/** Bagian yang dibuang pembersih SVG, kalau ada. */
	sanitized?: string[]
	/** Benar kalau berkas identik sudah ada dan barisnya dipakai ulang. */
	deduplicated?: boolean
}
