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

/**
 * Jumlah kata seperti Word/Docs: token tanpa huruf atau angka ("—", "-", "•")
 * bukan kata (uji editor 2 Okt, TKS-22).
 */
export function countWords(text: string): number {
	const trimmed = text.trim()
	if (trimmed === '') return 0
	return trimmed.split(/\s+/).filter((token) => /[\p{L}\p{N}]/u.test(token)).length
}

/**
 * Jumlah karakter (termasuk spasi) tanpa pemisah blok: `state.text` memisahkan
 * paragraf, butir, dan sel tabel dengan "\n", dan sel kosong pun menyumbang
 * satu karakter (TKS-22). Word juga tidak menghitung tanda paragraf.
 */
export function countCharacters(text: string): number {
	return text.replace(/\n/g, '').length
}
