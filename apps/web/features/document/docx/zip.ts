/**
 * DOCX adalah berkas zip berisi XML. Ini bagian yang membukanya.
 *
 * fflate dipilih ketimbang jszip yang dibawa mammoth: ia jauh lebih kecil,
 * membongkar secara sinkron, dan tidak menyeret Promise-library sendiri.
 */

import { unzipSync } from 'fflate'

export interface DocxArchive {
	/** Isi mentah sebuah entri, atau null bila tidak ada di dalam berkas. */
	bytes: (path: string) => Uint8Array | null
	/** Entri yang dibaca sebagai teks UTF-8; dipakai untuk seluruh bagian XML. */
	text: (path: string) => string | null
	/** Semua jalur di dalam arsip - dipakai untuk menemukan media dan header. */
	paths: () => string[]
}

export function openDocx(data: Uint8Array): DocxArchive {
	let entries: Record<string, Uint8Array>
	try {
		entries = unzipSync(data)
	} catch (cause) {
		// Penyebab paling lazim: berkas .doc lama yang diberi nama .docx, yang
		// bukan zip sama sekali. Pesan bawaan fflate tidak menjelaskan itu.
		throw new Error('Berkas ini bukan DOCX yang sah - isinya tidak bisa dibuka', { cause })
	}

	const decoder = new TextDecoder('utf-8')

	return {
		bytes: (path) => entries[path] ?? null,
		text: (path) => {
			const found = entries[path]
			return found ? decoder.decode(found) : null
		},
		paths: () => Object.keys(entries),
	}
}

/**
 * Jalur relatif di dalam arsip, diselesaikan terhadap direktori pemiliknya.
 *
 * Dipakai untuk menemukan media gambar dan bagian pendukung lain: rujukan di
 * berkas rels bersifat relatif terhadap berkas pemiliknya, misalnya
 * `media/logo.png` diartikan dari direktori `word/` menjadi `word/media/logo.png`.
 */
export function resolvePath(base: string, target: string): string {
	if (target.startsWith('/')) return target.slice(1)

	const directory = base.includes('/') ? base.slice(0, base.lastIndexOf('/')) : ''
	const segments = directory ? directory.split('/') : []

	for (const segment of target.split('/')) {
		if (segment === '.' || segment === '') continue
		if (segment === '..') segments.pop()
		else segments.push(segment)
	}
	return segments.join('/')
}
