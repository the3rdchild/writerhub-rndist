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

/*
 * "Restricted" berarti pengguna yang sedang masuk (`getByToken` hanya menuntut
 * sesi), BUKAN orang yang diundang - daftar undangan belum ada. Label lama
 * menjanjikan yang tidak ditepati (SHL-10).
 */
export const SHARE_ACCESS_LABELS: Record<ShareAccess, { label: string; description: string }> = {
	anyone: {
		label: 'Anyone with the link',
		description: 'Anyone on the internet who has the link can open it',
	},
	restricted: {
		label: 'Signed-in users with the link',
		description: 'Only people signed in to WritingHub can open the link',
	},
}

export const SHARE_ROLE_LABELS: Record<ShareRole, string> = {
	viewer: 'View',
	commenter: 'Comment',
	editor: 'Edit',
}
