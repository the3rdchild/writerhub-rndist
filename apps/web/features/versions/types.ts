import type { JSONContent } from '@tiptap/core'
export type VersionTrigger = 'manual' | 'interval' | 'pre_translate' | 'pre_restore' | 'ai_result'

export interface VersionSummary {
	id: string
	trigger: VersionTrigger
	label: string | null
	wordCount: number
	createdAt: number
	feature: string | null
}

export interface VersionDetail extends VersionSummary {
	content: JSONContent
}

export interface RestoreVersionResult {
	restored: VersionSummary
	preRestoreVersionId: string
}
