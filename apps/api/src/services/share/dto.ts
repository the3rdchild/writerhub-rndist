import { z } from 'zod'

export const shareAccessSchema = z.enum(['anyone', 'restricted'])
export const shareRoleSchema = z.enum(['viewer', 'commenter', 'editor'])

/**
 * Body untuk membuat share link baru.
 *
 * `content` adalah JSONContent dari editor Tiptap; backend tidak perlu memahami
 * strukturnya, cukup menyimpannya apa adanya di jsonb.
 */
export const createShareBodySchema = z.object({
	title: z.string().min(1).max(500),
	content: z.record(z.string(), z.unknown()),
	access: shareAccessSchema,
	role: shareRoleSchema,
})

export type CreateShareBody = z.infer<typeof createShareBodySchema>

export interface CreateShareResponse {
	token: string
	url: string
	title: string
	access: 'anyone' | 'restricted'
	role: 'viewer' | 'commenter' | 'editor'
	createdAt: number
}

export interface SharedDocumentResponse {
	title: string
	content: Record<string, unknown>
	access: 'anyone' | 'restricted'
	role: 'viewer' | 'commenter' | 'editor'
	createdAt: number
}
