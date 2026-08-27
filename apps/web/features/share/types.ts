import type { JSONContent } from '@tiptap/core'
export type ShareAccess = 'anyone' | 'restricted'
export type ShareRole = 'viewer' | 'commenter' | 'editor'

export interface SharedTab {
	id: string
	title: string
	emoji: string | null
	language: string | null
	content: JSONContent
}

export interface SharePayload {
	documentTitle: string
	tabs: SharedTab[]
	access: ShareAccess
	role: ShareRole
	createdAt: number
}

export interface CreateShareInput {
	documentId: string
	access: ShareAccess
	role: ShareRole
}

export interface CreateShareResult {
	token: string
	url: string
	documentId: string
	documentTitle: string
	access: ShareAccess
	role: ShareRole
	createdAt: number
}

export const SHARE_ACCESS_LABELS: Record<ShareAccess, { label: string; description: string }> = {
	anyone: {
		label: 'Siapa saja dengan link',
		description: 'Siapa pun di internet yang memiliki link dapat melihat',
	},
	restricted: { label: 'Dibatasi', description: 'Hanya orang yang diundang yang dapat mengakses' },
}

export const SHARE_ROLE_LABELS: Record<ShareRole, string> = {
	viewer: 'Penonton',
	commenter: 'Komentator',
	editor: 'Penyunting',
}
