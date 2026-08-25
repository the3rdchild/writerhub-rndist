import type { JSONContent } from '@tiptap/core'

/**
 * Tipe akses dan peran share. Sama dengan enum di backend.
 */
export type ShareAccess = 'anyone' | 'restricted'
export type ShareRole = 'viewer' | 'commenter' | 'editor'

/** Satu tab beku di dalam snapshot proyek yang dibagikan. */
export interface SharedTab {
	id: string
	title: string
	emoji: string | null
	language: string | null
	content: JSONContent
}

/** Satu dokumen beku (daftar tabnya) di dalam snapshot proyek yang dibagikan. */
export interface SharedDocument {
	id: string
	title: string
	tabs: SharedTab[]
}

export interface SharePayload {
	projectName: string
	documents: SharedDocument[]
	access: ShareAccess
	role: ShareRole
	createdAt: number
}

/** Share membagikan SATU PROYEK (seluruh dokumen + tab di dalamnya). */
export interface CreateShareInput {
	projectId: string
	access: ShareAccess
	role: ShareRole
}

export interface CreateShareResult {
	token: string
	url: string
	projectId: string
	projectName: string
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
