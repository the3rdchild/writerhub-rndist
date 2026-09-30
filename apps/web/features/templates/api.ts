import type { TemplateCard, TemplateSummary } from '@writer-hub/shared'
import { apiFetch } from '@/lib/api-client'

/**
 * Katalog untuk kartu galeri: tanpa `spec`, dan hanya awal kerangka tiap
 * template untuk pratinjaunya. Isi lengkapnya diambil per slug lewat
 * `getTemplate` saat sebuah template dipilih.
 */
export function listTemplateCards(category?: string): Promise<TemplateCard[]> {
	const query = new URLSearchParams({ view: 'card', ...(category ? { category } : {}) })
	return apiFetch<TemplateCard[]>(`/templates?${query}`)
}

/**
 * Satu template menurut slug. Dipakai dokumen yang sedang dibuka: ia hanya
 * butuh miliknya sendiri, dan menariknya dari daftar katalog berarti setiap
 * halaman editor ikut mengunduh seluruh katalog.
 */
export function getTemplate(slug: string): Promise<TemplateSummary> {
	return apiFetch<TemplateSummary>(`/templates/${encodeURIComponent(slug)}`)
}
