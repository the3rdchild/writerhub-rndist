'use client'

import { useQuery } from '@tanstack/react-query'
import type { TemplateSummary } from '@writer-hub/shared'
import { useDocuments } from '@/features/documents/use-documents'
import { useSessions } from '@/features/sessions/session-context'
import { useSync } from '@/features/sync/sync-context'
import { getTemplate, listTemplates } from './api'

export const TEMPLATES_QUERY_KEY = ['templates'] as const

export function useTemplates(category?: string) {
	return useQuery<TemplateSummary[]>({
		queryKey: [...TEMPLATES_QUERY_KEY, category ?? 'all'],
		queryFn: () => listTemplates(category),
	})
}

/**
 * Satu template menurut slug; tidak menembak apa pun untuk dokumen tanpa
 * template. Sengaja bukan pencarian di dalam katalog: hook di bawah hidup di
 * ChatProvider yang terpasang di setiap halaman, jadi memakai daftar berarti
 * editor ikut mengunduh seluruh katalog meski tak satu pun kartunya dipakai.
 */
export function useTemplate(slug: string | null) {
	return useQuery<TemplateSummary>({
		queryKey: [...TEMPLATES_QUERY_KEY, 'slug', slug],
		queryFn: () => getTemplate(slug as string),
		enabled: slug !== null,
	})
}

/**
 * Template dokumen yang sedang dibuka. Dokumen bertemplate selalu lahir di
 * server (lewat `/new` atau draf PPE), jadi slug-nya dibaca dari ringkasan
 * dokumen server yang tertaut ke sesi aktif, lalu diambil menurut slug itu.
 */
export function useActiveTemplate(): TemplateSummary | null {
	const { activeId } = useSessions()
	const { linkage } = useSync()
	const documents = useDocuments()

	const documentId = activeId ? linkage[activeId]?.documentId : undefined
	const slug = documents.data?.find((entry) => entry.id === documentId)?.templateSlug ?? null

	return useTemplate(slug).data ?? null
}
