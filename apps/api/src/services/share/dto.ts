import { z } from 'zod'

export const shareAccessSchema = z.enum(['anyone', 'restricted'])
export const shareRoleSchema = z.enum(['viewer', 'commenter', 'editor'])

/**
 * Body untuk membuat share link baru. Share membagikan SATU TAB (keputusan 2
 * di docs/DOCUMENT-TABS-RESTRUCTURE-PLAN.md) - kontrak respons tidak berubah.
 *
 * `tabId` menunjuk tab user yang sudah tersimpan; tanpa `tabId` (tab masih
 * lokal) wajib ada `title` + `content` dan server membuatkan dokumen induk +
 * satu tab dulu. `documentId` diterima sebagai alias usang untuk `tabId`
 * (id dokumen lama = id tab setelah migrasi 0009). `content` yang dikirim
 * bersama `tabId` menimpa konten tersimpan supaya snapshot memakai konten
 * terkini dari editor.
 *
 * `content` adalah JSONContent dari editor Tiptap; backend tidak perlu memahami
 * strukturnya, cukup menyimpannya apa adanya di jsonb.
 */
export const createShareBodySchema = z
	.object({
		tabId: z.uuid().optional(),
		documentId: z.uuid().optional(),
		title: z.string().min(1).max(500).optional(),
		content: z.record(z.string(), z.unknown()).optional(),
		access: shareAccessSchema,
		role: shareRoleSchema,
	})
	.refine(
		(body) =>
			body.tabId !== undefined ||
			body.documentId !== undefined ||
			(body.title !== undefined && body.content !== undefined),
		{
			message: 'title dan content wajib diisi bila tabId tidak dikirim',
		},
	)

export type CreateShareBody = z.infer<typeof createShareBodySchema>

export interface CreateShareResponse {
	token: string
	url: string
	/** Tab yang ditautkan share ini. */
	tabId: string
	/**
	 * Alias usang untuk `tabId` - nilainya sama. Dipertahankan supaya klien
	 * lama (yang mencatat kaitan share lewat field ini) tidak putus.
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
