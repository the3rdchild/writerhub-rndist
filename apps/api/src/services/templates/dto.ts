import type { TemplateCategory, TemplateLocale, TemplateSummary } from '@writer-hub/shared'
import type { Template } from '@/db/schemas'

export type { TemplateSummary }

/** Baris tabel menjadi bentuk kawat - dipakai daftar katalog maupun ambil per slug. */
export function toTemplate(row: Template): TemplateSummary {
	return {
		slug: row.slug,
		name: row.name,
		description: row.description,
		category: row.category as TemplateCategory,
		locale: row.locale as TemplateLocale,
		spec: row.spec,
		content: row.content,
	}
}
