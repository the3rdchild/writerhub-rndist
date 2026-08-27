'use client'

import type { Editor } from '@tiptap/react'
import { ExternalLink, Loader2, Plus, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { Citation } from '@/app/api/citations/route'
import type { EditorSelection } from '@/features/editor/selection'

export function CitationPopover({
	editor,
	selection,
	onClose,
}: {
	editor: Editor
	selection: EditorSelection
	onClose: () => void
}) {
	const [results, setResults] = useState<Citation[] | null>(null)
	const [error, setError] = useState<string | null>(null)

	useEffect(
		function fetchCitationSuggestions() {
			const controller = new AbortController()

			fetch(`/api/citations?q=${encodeURIComponent(selection.text.slice(0, 400))}`, {
				signal: controller.signal,
			})
				.then(async (response) => {
					const body = await response.json().catch(() => null)
					if (!response.ok) throw new Error(body?.errors?.join(', ') || 'Pencarian gagal')
					setResults(body.data as Citation[])
				})
				.catch((cause: unknown) => {
					if (controller.signal.aborted) return
					setError(cause instanceof Error ? cause.message : 'Pencarian gagal')
				})

			return () => controller.abort()
		},
		[selection.text],
	)
	const insert = (citation: Citation) => {
		const author = citation.authors[0]?.split(' ').pop() ?? 'Anon'
		const year = citation.year ?? 'n.d.'
		editor.chain().focus().insertContentAt(selection.to, ` (${author}, ${year})`).run()
		onClose()
	}

	return (
		<div className="flex w-[340px] flex-col gap-2 rounded-xl border border-line-strong bg-surface-raised p-3 shadow-[var(--menu-shadow)]">
			<div className="flex items-center justify-between">
				<span className="text-xs font-semibold text-foreground">Find citations</span>
				<button
					type="button"
					onClick={onClose}
					aria-label="Tutup"
					className="text-subtle transition-colors hover:text-foreground"
				>
					<X className="h-3.5 w-3.5" />
				</button>
			</div>

			{results === null && !error && (
				<div className="flex items-center gap-2 py-4 text-xs text-subtle">
					<Loader2 className="h-3.5 w-3.5 animate-spin" />
					Mencari di Crossref…
				</div>
			)}

			{error && <p className="rounded-lg bg-red-400/10 px-2 py-1.5 text-[11px] text-red-400">{error}</p>}

			{results?.length === 0 && (
				<p className="py-3 text-center text-xs text-subtle">Tidak ada referensi yang cocok</p>
			)}

			<div className="flex max-h-64 flex-col gap-1.5 overflow-y-auto">
				{results?.map((citation) => (
					<div
						key={citation.doi ?? citation.title}
						className="flex flex-col gap-1 rounded-lg bg-[var(--overlay-hover)] px-2.5 py-2"
					>
						<p className="text-xs font-medium leading-snug text-foreground">{citation.title}</p>
						<p className="text-[11px] text-subtle">
							{citation.authors.slice(0, 3).join(', ')}
							{citation.authors.length > 3 && ' et al.'}
							{citation.year && ` · ${citation.year}`}
							{citation.source && ` · ${citation.source}`}
						</p>

						<div className="flex items-center gap-1.5 pt-0.5">
							<button
								type="button"
								onClick={() => insert(citation)}
								className="flex items-center gap-1 rounded-md bg-accent/15 px-2 py-1 text-[11px] text-accent transition-colors hover:bg-accent/25"
							>
								<Plus className="h-3 w-3" />
								Sisipkan
							</button>
							{citation.url && (
								<a
									href={citation.url}
									target="_blank"
									rel="noreferrer"
									className="flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-subtle transition-colors hover:text-foreground"
								>
									<ExternalLink className="h-3 w-3" />
									Buka
								</a>
							)}
						</div>
					</div>
				))}
			</div>
		</div>
	)
}
