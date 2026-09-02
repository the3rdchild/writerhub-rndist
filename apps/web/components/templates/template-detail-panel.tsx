'use client'

import type { CitationStyle, TemplateSummary } from '@writer-hub/shared'
import { FileText } from 'lucide-react'
import { contentToPreviewHtml } from '@/features/templates/preview-html'
import { TemplatePreview } from './template-preview'

const CITATION_LABEL: Record<CitationStyle, string> = {
	apa7: 'APA edisi 7',
	ieee: 'IEEE [1]',
	acm: 'ACM Reference Format',
	vancouver: 'Vancouver',
	none: 'Tanpa sitasi',
}

interface TemplateDetailPanelProps {
	template: TemplateSummary
	pending: boolean
	error: string | null
	onUse: () => void
}

/**
 * Panel samping galeri: pratinjau besar, struktur bab, gaya sitasi, dan
 * caveats - catatan jujur tentang bagian format yang belum otomatis - sebelum
 * pengguna menekan "Pakai template ini" (`docs/TEMPLATE-GALLERY-PLAN.md` §6).
 */
export function TemplateDetailPanel({ template, pending, error, onUse }: TemplateDetailPanelProps) {
	const { spec } = template

	return (
		<aside className="flex w-96 shrink-0 flex-col overflow-y-auto border-l border-line bg-surface">
			<div className="flex justify-center border-b border-line bg-[var(--overlay-hover)] px-6 py-6">
				<TemplatePreview
					pageSetup={spec.layout.pageSetup}
					html={contentToPreviewHtml(template.content)}
					width={240}
					className="rounded-sm"
				/>
			</div>

			<div className="flex flex-1 flex-col gap-5 px-6 py-5">
				<div>
					<h2 className="text-lg font-semibold text-foreground">{template.name}</h2>
					<p className="mt-1 text-sm text-muted">{template.description}</p>
				</div>

				<section>
					<h3 className="text-xs font-semibold uppercase tracking-wide text-faint">Struktur</h3>
					<ul className="mt-2 space-y-1">
						{spec.structure.map((item) => (
							<li
								key={item.heading}
								className="flex items-baseline gap-2 text-sm text-foreground"
								style={{ paddingLeft: `${(item.level - 1) * 12}px` }}
							>
								<FileText className="h-3 w-3 shrink-0 self-center text-faint" />
								<span>{item.heading}</span>
								{!item.required && <span className="text-xs text-faint">(opsional)</span>}
							</li>
						))}
					</ul>
				</section>

				<section>
					<h3 className="text-xs font-semibold uppercase tracking-wide text-faint">Format</h3>
					<p className="mt-2 text-sm text-foreground">{CITATION_LABEL[spec.format.citationStyle]}</p>
					{spec.layout.columns && (
						<p className="text-sm text-foreground">{spec.layout.columns.count} kolom</p>
					)}
				</section>

				{spec.caveats && spec.caveats.length > 0 && (
					<section>
						<h3 className="text-xs font-semibold uppercase tracking-wide text-faint">Belum otomatis</h3>
						<ul className="mt-2 list-disc space-y-1 pl-4 text-sm text-muted">
							{spec.caveats.map((caveat) => (
								<li key={caveat}>{caveat}</li>
							))}
						</ul>
					</section>
				)}

				{error && <p className="text-sm text-red-600">{error}</p>}

				<button
					type="button"
					onClick={onUse}
					disabled={pending}
					className="mt-auto rounded-xl bg-accent px-5 py-2.5 text-sm font-medium text-accent-foreground transition-colors hover:bg-accent-hover disabled:opacity-60"
				>
					{pending ? 'Membuat dokumen…' : 'Pakai template ini'}
				</button>
			</div>
		</aside>
	)
}
