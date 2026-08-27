export const FILE_MIME_TYPES = [
	'application/pdf',
	'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
	'text/plain',
]

export const ALLOWED_MIME_TYPES = [...FILE_MIME_TYPES]

export function baseMimeType(value: string): string {
	return (value ?? '').split(';')[0].trim().toLowerCase()
}

export function isAllowedMime(value: string): boolean {
	return ALLOWED_MIME_TYPES.includes(baseMimeType(value))
}
