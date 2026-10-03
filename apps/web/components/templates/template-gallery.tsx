'use client'

import type { DocumentMetadata, TemplateCategory, TemplateSummary } from '@writer-hub/shared'
import { ArrowLeft, FilePlus2, Search } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import { createDocument } from '@/features/documents/api'
import { useSessions } from '@/features/sessions/session-context'
import { useTemplate, useTemplateCards } from '@/features/templates/use-templates'
import { TemplateCard } from './template-card'
import { TemplateDetailPanel } from './template-detail-panel'
import { TemplateMetadataDialog } from './template-metadata-dialog'

const CATEGORIES: Array<{ id: TemplateCategory | 'all'; label: string }> = [
	{ id: 'all', label: 'All' },
	{ id: 'academic_id', label: 'Academic' },
	{ id: 'paper', label: 'Paper' },
	{ id: 'business', label: 'Bisnis' },
	{ id: 'marketing', label: 'Marketing' },
]

/**
 * Halaman "Start a new document" ala galeri Google Docs: kartu pertama selalu
 * Dokumen kosong, selebihnya template dari katalog. Memilih kartu membuka
 * panel detail; "Pakai template ini" membuat dokumen di server lalu membukanya lewat
 * halaman serah-terima `/d/<id>` yang sama dengan draf.
 */
export function TemplateGallery() {
	const router = useRouter()
	const { newDocument } = useSessions()
	const templates = useTemplateCards()
	const [category, setCategory] = useState<TemplateCategory | 'all'>('all')
	const [query, setQuery] = useState('')
	const [selectedSlug, setSelectedSlug] = useState<string | null>(null)
	const [pending, setPending] = useState(false)
	const [useError, setUseError] = useState<string | null>(null)
	const [metadata, setMetadata] = useState<DocumentMetadata>({})
	const [metadataOpen, setMetadataOpen] = useState(false)

	/* Isian milik template, bukan milik galeri: berpindah template membuang
	 * yang sudah diketik, karena kuncinya pun berbeda. */
	// biome-ignore lint/correctness/useExhaustiveDependencies: sengaja hanya bereaksi pada pergantian template
	useEffect(
		function resetMetadataOnTemplateChange() {
			setMetadata({})
			setMetadataOpen(false)
		},
		[selectedSlug],
	)

	/* Kartu hanya membawa pratinjau; isi lengkap, struktur, dan isian
	 * metadatanya diambil saat template dipilih. */
	const selectedTemplate = useTemplate(selectedSlug)
	const selected = selectedTemplate.data?.slug === selectedSlug ? selectedTemplate.data : undefined

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
			const filled = Object.fromEntries(
				Object.entries(metadata).filter(([, value]) => value.trim().length > 0),
			)
			const created = await createDocument({
				templateSlug: template.slug,
				...(Object.keys(filled).length > 0 ? { metadata: filled } : {}),
			})
			router.push(`/d/${created.id}`)
		} catch (cause) {
			setUseError(cause instanceof Error ? cause.message : "Couldn't create a document from the template")
			setPending(false)
		}
	}

	const blankDocument = () => {
		newDocument()
		router.push('/')
	}

	return (
		/*
		 * Tinggi TETAP, bukan `min-h-screen`: dengan tinggi minimum, baris di
		 * bawah ini tumbuh mengikuti isi galeri, jadi `overflow-y-auto` di
		 * dalamnya tidak pernah memotong apa pun - seluruh halaman yang bergulir,
		 * dan panel detail ikut memanjang setinggi grid template. Pola yang sama
		 * dengan shell editor: tinggi viewport di akar, `min-h-0` di barisnya.
		 */
		<div className="flex h-dvh flex-col overflow-hidden bg-background">
			<header className="flex shrink-0 items-center gap-3 border-b border-line bg-surface px-4 py-3">
				<Link
					href="/"
					className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted transition-colors hover:bg-[var(--overlay-hover)] hover:text-foreground"
					aria-label="Back to editor"
				>
					<ArrowLeft className="h-5 w-5" />
				</Link>
				<h1 className="text-base font-semibold text-foreground">Start a new document</h1>
				<div className="relative ml-auto w-full max-w-xs">
					<Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
					<input
						type="search"
						value={query}
						onChange={(event) => setQuery(event.target.value)}
						placeholder="Search templates…"
						className="w-full rounded-lg border border-line bg-background py-2 pl-9 pr-3 text-sm text-foreground placeholder:text-faint focus:border-accent focus:outline-none"
					/>
				</div>
			</header>

			{/* `min-h-0` supaya ketiga kolomnya boleh lebih pendek dari isinya -
			    tanpa itu, flex item menolak menyusut dan gulirannya pindah ke
			    halaman. */}
			{/* `min-h-0` supaya ketiga kolomnya boleh lebih pendek dari isinya -
			    tanpa itu, flex item menolak menyusut dan gulirannya pindah ke
			    halaman. `relative` menjadi acuan panel detail saat ia melayang di
			    layar sempit. */}
			<div className="relative flex min-h-0 flex-1 flex-col overflow-hidden lg:flex-row">
				{/* Kategori: kolom kiri di layar lebar, deretan chip yang bisa digeser
				    di layar sempit - 176px terlalu mahal untuk dipakai nav di sana. */}
				<nav className="shrink-0 overflow-x-auto border-b border-line bg-surface px-3 py-2 lg:w-44 lg:overflow-y-auto lg:overflow-x-visible lg:border-r lg:border-b-0 lg:py-4">
					<ul className="flex gap-1 lg:block lg:space-y-1">
						{CATEGORIES.map((item) => (
							<li key={item.id} className="shrink-0 lg:shrink">
								<button
									type="button"
									onClick={() => setCategory(item.id)}
									className={`w-full whitespace-nowrap rounded-lg px-3 py-2 text-left text-sm transition-colors ${
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

				<main className="min-w-0 flex-1 overflow-y-auto px-6 py-6">
					{templates.isPending ? (
						<div className="flex h-64 items-center justify-center">
							<div className="h-8 w-8 animate-spin rounded-full border-2 border-accent border-t-transparent" />
						</div>
					) : templates.isError ? (
						<div className="flex h-64 flex-col items-center justify-center text-center">
							<h2 className="text-lg font-medium text-foreground">Could not load templates</h2>
							<p className="mt-1 max-w-md text-sm text-muted">
								{templates.error instanceof Error
									? templates.error.message
									: 'Something went wrong while reading the template catalog.'}
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
									<p className="text-sm font-medium text-foreground">Blank document</p>
									<p className="mt-0.5 text-xs text-muted">Start from a blank page.</p>
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

				{selectedSlug && !selected && (
					<aside className="absolute inset-y-0 right-0 z-30 flex w-96 max-w-[calc(100%-2rem)] shrink-0 items-center justify-center border-l border-line bg-surface p-6 text-center shadow-2xl lg:relative lg:max-w-none lg:shadow-none">
						{selectedTemplate.isError ? (
							<p className="text-sm text-muted">
								{selectedTemplate.error instanceof Error
									? selectedTemplate.error.message
									: "Couldn't load the template details."}
							</p>
						) : (
							<div className="h-8 w-8 animate-spin rounded-full border-2 border-accent border-t-transparent" />
						)}
					</aside>
				)}

				{selected && (
					<>
						{/* Latar peredup hanya ada saat panelnya melayang; di layar lebar
						    panel berbagi ruang, bukan menutupi. */}
						<button
							type="button"
							aria-label="Close template details"
							onClick={() => setSelectedSlug(null)}
							className="absolute inset-0 z-20 bg-black/40 lg:hidden"
						/>
						<TemplateDetailPanel
							template={selected}
							pending={pending}
							error={useError}
							filledMetadata={Object.values(metadata).filter((value) => value.trim()).length}
							onEditMetadata={() => setMetadataOpen(true)}
							onUse={() => void createFromTemplate(selected)}
							onClose={() => setSelectedSlug(null)}
						/>
					</>
				)}
			</div>

			{metadataOpen && selected?.spec.metadataFields?.length && (
				<TemplateMetadataDialog
					title={`Metadata - ${selected.name}`}
					fields={selected.spec.metadataFields}
					values={metadata}
					afterCreation={false}
					onSave={(next) => {
						setMetadata(next)
						setMetadataOpen(false)
					}}
					onClose={() => setMetadataOpen(false)}
				/>
			)}
		</div>
	)
}
