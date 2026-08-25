import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs))
}
export function fingerprint(text: string): string {
	let hash = 5381
	for (let i = 0; i < text.length; i += 1) {
		hash = ((hash << 5) + hash + text.charCodeAt(i)) | 0
	}
	return `${hash >>> 0}:${text.length}`
}

export function countWords(text: string): number {
	const trimmed = text.trim()
	return trimmed === '' ? 0 : trimmed.split(/\s+/).length
}
