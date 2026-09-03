import type { JSONContent } from '@tiptap/core'
import type { TabLayout, TabLayoutOverride } from '@writer-hub/shared'
export type ShareAccess = 'anyone' | 'restricted'
export type ShareRole = 'viewer' | 'commenter' | 'editor'

export interface SharedTab {
	id: string
	title: string
	emoji: string | null
	language: string | null
	content: JSONContent
	/** Penimpa tata letak tab ini; null berarti mengikuti dasar dokumen. */
	layout: TabLayoutOverride | null
}

export interface SharePayload {
	documentTitle: string
	/** Tata letak dasar dokumen; tab bisa menimpanya lewat `SharedTab.layout`. */
	layout: TabLayout | null
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
