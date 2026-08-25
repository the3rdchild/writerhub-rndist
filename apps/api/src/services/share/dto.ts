import { z } from 'zod'

export const shareAccessSchema = z.enum(['anyone', 'restricted'])
export const shareRoleSchema = z.enum(['viewer', 'commenter', 'editor'])
export const createShareBodySchema = z.object({
	documentId: z.uuid(),
	access: shareAccessSchema,
	role: shareRoleSchema,
})

export type CreateShareBody = z.infer<typeof createShareBodySchema>
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
