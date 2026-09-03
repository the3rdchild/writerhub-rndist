import type { TabLayout, TabLayoutOverride } from '@writer-hub/shared'
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
	/**
	 * Penimpa tata letak milik tab ini; null berarti ia mengikuti dasar
	 * dokumen. Ikut dikirim karena penerima tautan tidak punya Y.Doc - tanpa
	 * ini ia merender naskah orang lain dengan ukuran kertas, margin, dan huruf
	 * bawaan, dan rancangan satu halaman jadi salah bentuk.
	 */
	layout: TabLayoutOverride | null
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
	/** Tata letak dasar dokumen; tab bisa menimpanya lewat `SharedTab.layout`. */
	layout: TabLayout | null
	tabs: SharedTab[]
	access: 'anyone' | 'restricted'
	role: 'viewer' | 'commenter' | 'editor'
	createdAt: number
}
