import { z } from 'zod'

export const shareAccessSchema = z.enum(['anyone', 'restricted'])
export const shareRoleSchema = z.enum(['viewer', 'commenter', 'editor'])

/**
 * Body untuk membuat share link baru. Share membagikan SATU DOKUMEN (seluruh
 * tab di dalamnya, dibaca LIVE tiap link dibuka - pola Google Docs) - dokumen
 * tujuan harus milik user.
 */
export const createShareBodySchema = z.object({
	documentId: z.uuid(),
	access: shareAccessSchema,
	role: shareRoleSchema,
})

export type CreateShareBody = z.infer<typeof createShareBodySchema>

/** Satu tab, dibaca live dari `document_tabs` saat share dibuka. */
export interface SharedTab {
	id: string
	title: string
	emoji: string | null
	language: string | null
	content: Record<string, unknown>
}

export interface CreateShareResponse {
	token: string
	url: string
	documentId: string
	documentTitle: string
	access: 'anyone' | 'restricted'
	role: 'viewer' | 'commenter' | 'editor'
	createdAt: number
}

export interface SharedDocumentResponse {
	documentTitle: string
	tabs: SharedTab[]
	access: 'anyone' | 'restricted'
	role: 'viewer' | 'commenter' | 'editor'
	createdAt: number
}
