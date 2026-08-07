import type { JSONContent } from '@tiptap/core'
import { gunzipSync, gzipSync, strToU8 } from 'fflate'

/**
 * Muatan yang disematkan ke dalam hash URL saat membagikan dokumen.
 *
 * Versi Opsi A tidak menyentuh backend: seluruh muatan diencode ke dalam
 * fragment hash, sehingga tidak pernah meninggalkan browser. Konten berupa
 * JSONContent editor supaya format, tabel, dan gambar base64 ikut terbawa.
 */
export interface SharePayload {
	version: 1
	title: string
	content: JSONContent
	access: ShareAccess
	role: ShareRole
	createdAt: number
}

export type ShareAccess = 'anyone' | 'restricted'
export type ShareRole = 'viewer' | 'commenter' | 'editor'

export const SHARE_ACCESS_LABELS: Record<ShareAccess, { label: string; description: string }> = {
	anyone: { label: 'Siapa saja dengan link', description: 'Siapa pun di internet yang memiliki link dapat melihat' },
	restricted: { label: 'Dibatasi', description: 'Hanya orang yang diundang yang dapat mengakses' },
}

export const SHARE_ROLE_LABELS: Record<ShareRole, string> = {
	viewer: 'Penonton',
	commenter: 'Komentator',
	editor: 'Penyunting',
}

const HASH_PREFIX = '#doc='

function uint8ToBase64(bytes: Uint8Array): string {
	let binary = ''
	for (let i = 0; i < bytes.length; i += 1) {
		binary += String.fromCharCode(bytes[i])
	}
	return btoa(binary)
}

function base64ToUint8(base64: string): Uint8Array {
	const binary = atob(base64)
	const bytes = new Uint8Array(binary.length)
	for (let i = 0; i < binary.length; i += 1) {
		bytes[i] = binary.charCodeAt(i)
	}
	return bytes
}

/** Kompres payload jadi base64 yang muat di hash URL. */
export function encodeShare(payload: SharePayload): string {
	const json = JSON.stringify(payload)
	const compressed = gzipSync(strToU8(json))
	return `${HASH_PREFIX}${uint8ToBase64(compressed)}`
}

/** Baca hash URL dan kembalikan payload, atau null bila rusak. */
export function decodeShare(hash: string): SharePayload | null {
	if (!hash.startsWith(HASH_PREFIX)) return null
	try {
		const compressed = base64ToUint8(hash.slice(HASH_PREFIX.length))
		const decompressed = gunzipSync(compressed)
		const json = new TextDecoder().decode(decompressed)
		return JSON.parse(json) as SharePayload
	} catch {
		return null
	}
}
