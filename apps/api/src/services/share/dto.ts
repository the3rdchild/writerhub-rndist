import { z } from 'zod'

export const shareAccessSchema = z.enum(['anyone', 'restricted'])
export const shareRoleSchema = z.enum(['viewer', 'commenter', 'editor'])

/**
 * Body untuk membuat share link baru.
 *
 * `documentId` menunjuk dokumen user yang sudah tersimpan; tanpa `documentId`
 * (dokumen masih lokal) wajib ada `title` + `content` dan server membuatkan
 * baris dokumennya dulu. `content` yang dikirim bersama `documentId` menimpa
 * konten tersimpan supaya snapshot memakai konten terkini dari editor.
 *
 * `content` adalah JSONContent dari editor Tiptap; backend tidak perlu memahami
 * strukturnya, cukup menyimpannya apa adanya di jsonb.
 */
export const createShareBodySchema = z
	.object({
		documentId: z.uuid().optional(),
		title: z.string().min(1).max(500).optional(),
		content: z.record(z.string(), z.unknown()).optional(),
		access: shareAccessSchema,
		role: shareRoleSchema,
	})
	.refine((body) => body.documentId !== undefined || (body.title !== undefined && body.content !== undefined), {
		message: 'title dan content wajib diisi bila documentId tidak dikirim',
	})

export type CreateShareBody = z.infer<typeof createShareBodySchema>

export interface CreateShareResponse {
	token: string
	url: string
	/**
	 * Dokumen user yang ditautkan share ini - dikirim balik supaya pemanggil
	 * yang belum punya dokumen server (share dari tab lokal) bisa mencatat
	 * kaitannya, alih-alih membuat dokumen baru tiap kali membagikan.
	 */
	documentId: string
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
