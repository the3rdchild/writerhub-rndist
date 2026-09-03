export const FILE_MIME_TYPES = [
	'application/pdf',
	'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
	'text/plain',
]

/**
 * Gambar yang boleh diunggah sebagai aset proyek.
 *
 * SVG ada di sini, tapi ia bukan gambar seperti yang lain: ia dokumen yang bisa
 * memuat skrip. Di dalam blok HTML ia aman karena dimuat lewat `<img>`, dan SVG
 * yang dimuat sebagai gambar tidak pernah menjalankan skrip - tapi jaminan itu
 * hilang begitu URL-nya dibuka langsung di tab peramban. Karena itu SVG selalu
 * melewati `lib/svg-sanitize.ts` sebelum tersimpan; jangan pernah menerimanya
 * apa adanya.
 */
export const IMAGE_MIME_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/svg+xml']

export const ALLOWED_MIME_TYPES = [...FILE_MIME_TYPES]

export function baseMimeType(value: string): string {
	return (value ?? '').split(';')[0].trim().toLowerCase()
}

export function isAllowedMime(value: string): boolean {
	return ALLOWED_MIME_TYPES.includes(baseMimeType(value))
}

export function isAllowedImageMime(value: string): boolean {
	return IMAGE_MIME_TYPES.includes(baseMimeType(value))
}

export const SVG_MIME = 'image/svg+xml'

const IMAGE_EXTENSIONS: Record<string, string> = {
	'image/png': 'png',
	'image/jpeg': 'jpg',
	'image/webp': 'webp',
	'image/gif': 'gif',
	[SVG_MIME]: 'svg',
}

export function imageExtension(mimeType: string): string {
	return IMAGE_EXTENSIONS[baseMimeType(mimeType)] ?? 'bin'
}
