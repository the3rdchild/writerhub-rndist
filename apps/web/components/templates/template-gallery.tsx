'use client'

import type { TemplateCategory, TemplateSummary } from '@writer-hub/shared'
import { ArrowLeft, FilePlus2, Search } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useMemo, useState } from 'react'
import { createDocument } from '@/features/documents/api'
import { useSessions } from '@/features/sessions/session-context'
import { useTemplates } from '@/features/templates/use-templates'
import { TemplateCard } from './template-card'
import { TemplateDetailPanel } from './template-detail-panel'

const CATEGORIES: Array<{ id: TemplateCategory | 'all'; label: string }> = [
	{ id: 'all', label: 'Semua' },
	{ id: 'academic_id', label: 'Akademik' },
	{ id: 'paper', label: 'Paper' },
	{ id: 'business', label: 'Bisnis' },
	{ id: 'marketing', label: 'Marketing' },
]

/**
 * Halaman "Mulai dokumen baru" ala galeri Google Docs: kartu pertama selalu
 * Dokumen kosong, selebihnya template dari katalog
 * (`docs/TEMPLATE-GALLERY-PLAN.md` §6). Memilih kartu membuka panel detail;
 * "Pakai template ini" membuat dokumen di server lalu membukanya lewat
 * halaman serah-terima `/d/<id>` yang sama dengan draf.
 */
export function TemplateGallery() {
	const router = useRouter()
	const { newDocument } = useSessions()
	const templates = useTemplates()
	const [category, setCategory] = useState<TemplateCategory | 'all'>('all')
	const [query, setQuery] = useState('')
	const [selectedSlug, setSelectedSlug] = useState<string | null>(null)
	const [pending, setPending] = useState(false)
	const [useError, setUseError] = useState<string | null>(null)

	const selected = (templates.data ?? []).find((item) => item.slug === selectedSlug)

	const visible = useMemo(() => {
		const needle = query.trim().toLowerCase()
		return (templates.data ?? []).filter((template) => {
			if (category !== 'all' && template.category !== category) return false
			if (!needle) return true
			return (
				template.name.toLowerCase().includes(needle) || template.description.toLowerCase().includes(needle)
			)
		})
	}, [templates.data, category, query])

	const createFromTemplate = async (template: TemplateSummary) => {
		setPending(true)
		setUseError(null)
		try {
			const created = await createDocument({ templateSlug: template.slug })
			router.push(`/d/${created.id}`)
		} catch (cause) {
			setUseError(cause instanceof Error ? cause.message : 'Gagal membuat dokumen dari template')
			setPending(false)
		}
	}

	const blankDocument = () => {
		newDocument()
		router.push('/')
	}

	return (
		<div className="flex min-h-screen flex-col bg-background">
			<header className="sticky top-0 z-20 flex items-center gap-3 border-b border-line bg-surface px-4 py-3">
				<Link
					href="/"
					className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted transition-colors hover:bg-[var(--overlay-hover)] hover:text-foreground"
					aria-label="Kembali ke editor"
				>
					<ArrowLeft className="h-5 w-5" />
				</Link>
				<h1 className="text-base font-semibold text-foreground">Mulai dokumen baru</h1>
				<div className="relative ml-auto w-full max-w-xs">
					<Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
					<input
						type="search"
						value={query}
						onChange={(event) => setQuery(event.target.value)}
						placeholder="Cari template…"
						className="w-full rounded-lg border border-line bg-background py-2 pl-9 pr-3 text-sm text-foreground placeholder:text-faint focus:border-accent focus:outline-none"
					/>
				</div>
			</header>

			<div className="flex flex-1 overflow-hidden">
				<nav className="w-44 shrink-0 border-r border-line bg-surface px-3 py-4">
					<ul className="space-y-1">
						{CATEGORIES.map((item) => (
							<li key={item.id}>
								<button
									type="button"
									onClick={() => setCategory(item.id)}
									className={`w-full rounded-lg px-3 py-2 text-left text-sm transition-colors ${
										category === item.id
											? 'bg-[var(--overlay-hover)] font-medium text-foreground'
											: 'text-muted hover:bg-[var(--overlay-hover)] hover:text-foreground'
									}`}
								>
									{item.label}
								</button>
							</li>
						))}
					</ul>
				</nav>

				<main className="flex-1 overflow-y-auto px-6 py-6">
					{templates.isPending ? (
						<div className="flex h-64 items-center justify-center">
							<div className="h-8 w-8 animate-spin rounded-full border-2 border-accent border-t-transparent" />
						</div>
					) : templates.isError ? (
						<div className="flex h-64 flex-col items-center justify-center text-center">
							<h2 className="text-lg font-medium text-foreground">Gagal memuat template</h2>
							<p className="mt-1 max-w-md text-sm text-muted">
								{templates.error instanceof Error
									? templates.error.message
									: 'Terjadi kesalahan saat membaca katalog template.'}
							</p>
						</div>
					) : (
						<div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
							<button
								type="button"
								onClick={blankDocument}
								className="flex flex-col rounded-xl border border-line bg-surface text-left transition-colors hover:border-accent/60"
							>
								<div className="flex h-48 items-center justify-center border-b border-line bg-[var(--overlay-hover)]">
									<FilePlus2 className="h-10 w-10 text-accent" />
								</div>
								<div className="px-4 py-3">
									<p className="text-sm font-medium text-foreground">Dokumen kosong</p>
									<p className="mt-0.5 text-xs text-muted">Mulai dari halaman kosong.</p>
								</div>
							</button>

							{visible.map((template) => (
								<TemplateCard
									key={template.slug}
									template={template}
									selected={selectedSlug === template.slug}
									onSelect={() => setSelectedSlug(template.slug)}
								/>
							))}
						</div>
					)}
				</main>

				{selected && (
					<TemplateDetailPanel
						template={selected}
						pending={pending}
						error={useError}
						onUse={() => void createFromTemplate(selected)}
					/>
				)}
			</div>
		</div>
	)
}
