'use client'

import type { TemplateSummary } from '@writer-hub/shared'
import { contentToPreviewHtml } from '@/features/templates/preview-html'
import { TemplatePreview } from './template-preview'

interface TemplateCardProps {
	template: TemplateSummary
	selected: boolean
	onSelect: () => void
}

export function TemplateCard({ template, selected, onSelect }: TemplateCardProps) {
	return (
		<button
			type="button"
			onClick={onSelect}
			className={`group flex flex-col rounded-xl border bg-surface text-left transition-colors ${
				selected ? 'border-accent' : 'border-line hover:border-accent/60'
			}`}
		>
			<div className="flex justify-center border-b border-line bg-[var(--overlay-hover)] px-4 pt-4">
				<TemplatePreview
					pageSetup={template.spec.layout.pageSetup}
					html={contentToPreviewHtml(template.content)}
					width={150}
					className="rounded-t-sm"
				/>
			</div>
			<div className="px-4 py-3">
				<p className="text-sm font-medium text-foreground">{template.name}</p>
				<p className="mt-0.5 line-clamp-2 text-xs text-muted">{template.description}</p>
			</div>
		</button>
	)
}
