import type { TemplateCategory, TemplateDetail, TemplateLocale, TemplateSummary } from '@writer-hub/shared'
import type { Template } from '@/db/schemas'

export type { TemplateDetail, TemplateSummary }

export function toSummary(row: Template): TemplateSummary {
	return {
		slug: row.slug,
		name: row.name,
		description: row.description,
		category: row.category as TemplateCategory,
		locale: row.locale as TemplateLocale,
		spec: row.spec,
		builtin: row.builtin,
	}
}

export function toDetail(row: Template): TemplateDetail {
	return { ...toSummary(row), content: row.content }
}
