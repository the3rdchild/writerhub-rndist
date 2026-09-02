import type { TemplateSummary } from '@writer-hub/shared'
import { apiFetch } from '@/lib/api-client'

export function listTemplates(category?: string): Promise<TemplateSummary[]> {
	const query = category ? `?category=${encodeURIComponent(category)}` : ''
	return apiFetch<TemplateSummary[]>(`/templates${query}`)
}

/**
 * Satu template menurut slug. Dipakai dokumen yang sedang dibuka: ia hanya
 * butuh miliknya sendiri, dan menariknya dari daftar katalog berarti setiap
 * halaman editor ikut mengunduh seluruh katalog.
 */
export function getTemplate(slug: string): Promise<TemplateSummary> {
	return apiFetch<TemplateSummary>(`/templates/${encodeURIComponent(slug)}`)
}
