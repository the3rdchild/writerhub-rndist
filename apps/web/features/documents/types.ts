import type { JSONContent } from '@tiptap/core'

/**
 * Dokumen milik user di server. `DocumentSummary` dipakai daftar /library,
 * `DocumentDetail` membawa naskahnya sekalian.
 */
export interface DocumentSummary {
	id: string
	title: string
	emoji: string | null
	language: string | null
	/** ID proyek tempat dokumen bernaung; null berarti "Tanpa proyek". */
	projectId: string | null
	/** Epoch milidetik (server mengirim `Date.getTime()`). */
	updatedAt: number
	createdAt: number
}

export interface DocumentDetail extends DocumentSummary {
	content: JSONContent
}

export interface CreateDocumentInput {
	title: string
	content: JSONContent
	emoji?: string | null
	language?: string | null
}

/** Semua field opsional; yang tidak dikirim dibiarkan oleh server. */
export interface UpdateDocumentInput {
	title?: string
	content?: JSONContent
	emoji?: string | null
	language?: string | null
	/** ID proyek tujuan; `null` mengeluarkan dokumen dari proyeknya. */
	projectId?: string | null
}
