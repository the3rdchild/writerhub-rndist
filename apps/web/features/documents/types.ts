import type { JSONContent } from '@tiptap/core'
import type { DocumentMetadata, ResearchBrief, TabLayout, TabLayoutOverride } from '@writer-hub/shared'

export interface DocumentSummary {
	id: string
	title: string
	projectId: string
	templateSlug: string | null
	metadata: DocumentMetadata | null
	/** Salinan server dari brief di Y.Doc; null untuk dokumen yang belum pernah punya. */
	brief: ResearchBrief | null
	layout: TabLayout | null
	tabCount: number
	updatedAt: number
	createdAt: number
}

export interface DocumentDetail extends DocumentSummary {
	tabs: TabSummary[]
}

export interface TabSummary {
	id: string
	documentId: string
	title: string
	emoji: string | null
	language: string | null
	layout: TabLayoutOverride | null
	position: number
	updatedAt: number
	createdAt: number
}

export interface TabDetail extends TabSummary {
	content: JSONContent
}

export interface CreateDocumentInput {
	title?: string
	content?: JSONContent
	emoji?: string | null
	language?: string | null
	projectId?: string
	templateSlug?: string
	layout?: TabLayout | null
	tabLayout?: TabLayoutOverride | null
	/** Isian metadata template; ikut mengganti teks contoh di kerangka. */
	metadata?: DocumentMetadata
	brief?: ResearchBrief
}

export interface UpdateDocumentInput {
	title?: string
	projectId?: string
	layout?: TabLayout | null
	metadata?: DocumentMetadata | null
	brief?: ResearchBrief | null
}

export interface CreateTabInput {
	title?: string
	content?: JSONContent
	emoji?: string | null
	language?: string | null
	layout?: TabLayoutOverride | null
}

export interface UpdateTabInput {
	title?: string
	content?: JSONContent
	emoji?: string | null
	language?: string | null
	layout?: TabLayoutOverride | null
}
