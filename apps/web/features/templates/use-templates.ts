'use client'

import { useQuery } from '@tanstack/react-query'
import type { TemplateSummary } from '@writer-hub/shared'
import { useDocuments } from '@/features/documents/use-documents'
import { useSessions } from '@/features/sessions/session-context'
import { useSync } from '@/features/sync/sync-context'
import { listTemplates } from './api'

export const TEMPLATES_QUERY_KEY = ['templates'] as const

export function useTemplates(category?: string) {
	return useQuery<TemplateSummary[]>({
		queryKey: [...TEMPLATES_QUERY_KEY, category ?? 'all'],
		queryFn: () => listTemplates(category),
	})
}

/**
 * Template dokumen yang sedang dibuka. Dokumen bertemplate selalu lahir di
 * server (lewat `/new` atau draf PPE), jadi slug-nya dibaca dari ringkasan
 * dokumen server yang tertaut ke sesi aktif, lalu dicocokkan ke katalog.
 */
export function useActiveTemplate(): TemplateSummary | null {
	const { activeId } = useSessions()
	const { linkage } = useSync()
	const documents = useDocuments()
	const templates = useTemplates()

	const documentId = activeId ? linkage[activeId]?.documentId : undefined
	const slug = documents.data?.find((entry) => entry.id === documentId)?.templateSlug ?? null

	return templates.data?.find((template) => template.slug === slug) ?? null
}
