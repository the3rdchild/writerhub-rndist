/**
 * Menanam gambar sub-agent ke dalam rancangan satu halaman.
 *
 * Model menulis markup pamfletnya lengkap, tapi menaruh `<!--diagram:tren-->`
 * di tempat bagannya. Sub-agent menggambar terpisah, lalu penanda itu diganti
 * di sini - **di klien, sesudah keduanya selesai**.
 *
 * Kenapa penanda dan bukan model yang menempelkan sendiri: kalau model harus
 * menempelkan, gambarnya harus lebih dulu sampai ke tangannya, dan itu berarti
 * ratusan baris koordinat singgah di percakapan - biaya yang seluruh rancangan
 * sub-agent ini hindari. Dengan penanda, markup dan gambar bertemu pertama kali
 * di sini, dan tidak satu pun dari keduanya pernah melewati konteks model.
 */

/**
 * Sengaja komentar HTML, bukan elemen atau atribut khusus.
 *
 * Markup yang penandanya belum sempat diganti tetap sah dan tetap bisa
 * dirender - yang muncul cuma petak kosong, bukan halaman yang rusak. Penanda
 * berupa elemen palsu akan tampil sebagai teks mentah di tengah rancangan.
 */
const PLACEHOLDER = /<!--\s*diagram:([a-z0-9_-]{1,40})\s*-->/gi

export function placeholderIds(html: string): string[] {
	return [...html.matchAll(PLACEHOLDER)].map((match) => match[1].toLowerCase())
}

export interface Stitched {
	html: string
	/** Penanda yang tidak punya gambar - dilaporkan, bukan dibiarkan diam. */
	missing: string[]
}

export function stitchDiagrams(html: string, drawn: ReadonlyMap<string, string>): Stitched {
	const missing: string[] = []

	const stitched = html.replace(PLACEHOLDER, (match, rawId: string) => {
		const svg = drawn.get(rawId.toLowerCase())
		if (svg) return svg
		missing.push(rawId.toLowerCase())
		return match
	})

	return { html: stitched, missing }
}
