import type { TemplateDetail, TemplateSummary } from '@writer-hub/shared'
import { apiFetch } from '@/lib/api-client'

export function listTemplates(category?: string): Promise<TemplateSummary[]> {
	const query = category ? `?category=${encodeURIComponent(category)}` : ''
	return apiFetch<TemplateSummary[]>(`/templates${query}`)
}

export function getTemplate(slug: string): Promise<TemplateDetail> {
	return apiFetch<TemplateDetail>(`/templates/${encodeURIComponent(slug)}`)
}
