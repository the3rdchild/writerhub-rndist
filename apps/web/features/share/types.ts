import type { JSONContent } from '@tiptap/core'

/**
 * Tipe akses dan peran share. Sama dengan enum di backend.
 */
export type ShareAccess = 'anyone' | 'restricted'
export type ShareRole = 'viewer' | 'commenter' | 'editor'

export interface SharePayload {
	title: string
	content: JSONContent
	access: ShareAccess
	role: ShareRole
	createdAt: number
}

export interface CreateShareInput {
	/**
	 * Dokumen user yang sudah tersimpan di cloud. Tanpa ini, share dibuat dari
	 * `title` + `content` mentah seperti sebelumnya.
	 */
	documentId?: string
	title?: string
	content?: JSONContent
	access: ShareAccess
	role: ShareRole
}

export interface CreateShareResult {
	token: string
	url: string
	title: string
	access: ShareAccess
	role: ShareRole
	createdAt: number
}

export const SHARE_ACCESS_LABELS: Record<ShareAccess, { label: string; description: string }> = {
	anyone: { label: 'Siapa saja dengan link', description: 'Siapa pun di internet yang memiliki link dapat melihat' },
	restricted: { label: 'Dibatasi', description: 'Hanya orang yang diundang yang dapat mengakses' },
}

export const SHARE_ROLE_LABELS: Record<ShareRole, string> = {
	viewer: 'Penonton',
	commenter: 'Komentator',
	editor: 'Penyunting',
}
