'use client'

export function safeFilename(title: string, extension: string): string {
	const base =
		title
			.trim()
			.replace(/[\\/:*?"<>|]+/g, '-')
			.slice(0, 80) || 'document'
	return `${base}.${extension}`
}

export function download(blob: Blob, filename: string): void {
	const url = URL.createObjectURL(blob)
	const anchor = document.createElement('a')
	anchor.href = url
	anchor.download = filename
	anchor.click()
	setTimeout(() => URL.revokeObjectURL(url), 1_000)
}
