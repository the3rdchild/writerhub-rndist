import type { JSONContent } from '@tiptap/core'

export interface DocumentSummary {
	id: string
	title: string
	projectId: string
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
	position: number
	updatedAt: number
	createdAt: number
}

export interface TabDetail extends TabSummary {
	content: JSONContent
}

export interface CreateDocumentInput {
	title: string
	content?: JSONContent
	emoji?: string | null
	language?: string | null
	projectId?: string
}

export interface UpdateDocumentInput {
	title?: string
	projectId?: string
}

export interface CreateTabInput {
	title?: string
	content?: JSONContent
	emoji?: string | null
	language?: string | null
}

export interface UpdateTabInput {
	title?: string
	content?: JSONContent
	emoji?: string | null
	language?: string | null
}
