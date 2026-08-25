import { z } from 'zod'

export const shareAccessSchema = z.enum(['anyone', 'restricted'])
export const shareRoleSchema = z.enum(['viewer', 'commenter', 'editor'])

/**
 * Body untuk membuat share link baru. Share membagikan SATU PROYEK (seluruh
 * dokumen + tab di dalamnya, dibekukan apa adanya saat dibuat) - proyek
 * tujuan harus milik user.
 */
export const createShareBodySchema = z.object({
	projectId: z.uuid(),
	access: shareAccessSchema,
	role: shareRoleSchema,
})

export type CreateShareBody = z.infer<typeof createShareBodySchema>

/** Satu tab beku di dalam snapshot. */
export interface SharedTab {
	id: string
	title: string
	emoji: string | null
	language: string | null
	content: Record<string, unknown>
}

/** Satu dokumen beku (daftar tabnya) di dalam snapshot. */
export interface SharedDocument {
	id: string
	title: string
	tabs: SharedTab[]
}

export interface CreateShareResponse {
	token: string
	url: string
	projectId: string
	projectName: string
	access: 'anyone' | 'restricted'
	role: 'viewer' | 'commenter' | 'editor'
	createdAt: number
}

export interface SharedProjectResponse {
	projectName: string
	documents: SharedDocument[]
	access: 'anyone' | 'restricted'
	role: 'viewer' | 'commenter' | 'editor'
	createdAt: number
}
