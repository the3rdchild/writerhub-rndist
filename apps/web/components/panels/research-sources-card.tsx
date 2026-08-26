'use client'

import type { ResearchSource } from '@writer-hub/shared'
import { ExternalLink } from 'lucide-react'

/**
 * Chip sumber di lini masa langkah, supaya penulis bisa memeriksa asal fakta
 * sebelum menerima kartu aksi tulis.
 *
 * Sengaja bukan gerbang: yang menahan naskah tetap tombol Apply pada kartu
 * aksi. Dua gerbang untuk satu keputusan hanya menambah klik.
 */
function hostOf(url: string): string {
	try {
		return new URL(url).hostname.replace(/^www\./, '')
	} catch {
		return url
	}
}

export function ResearchSourcesCard({ sources }: { sources: ResearchSource[] }) {
	if (sources.length === 0) return null

	return (
		<div className="mx-1.5 mb-1 flex flex-wrap gap-1 rounded-md bg-surface-inset px-2 py-1.5">
			{sources.map((source) => (
				<a
					key={source.url}
					href={source.url}
					target="_blank"
					rel="noreferrer noopener"
					title={`${source.title}${source.publishedAt ? ` · ${source.publishedAt}` : ''}`}
					className="flex max-w-full items-center gap-1 rounded-full bg-surface-raised px-2 py-0.5 text-[10px] text-subtle transition-colors hover:text-foreground"
				>
					<span className="truncate">{hostOf(source.url)}</span>
					{source.publishedAt && (
						<span className="shrink-0 text-faint">{source.publishedAt.slice(0, 10)}</span>
					)}
					<ExternalLink className="h-2.5 w-2.5 shrink-0" />
				</a>
			))}
		</div>
	)
}
