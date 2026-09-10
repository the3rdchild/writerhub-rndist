'use client'

import type { CitationStyle, TemplateSummary } from '@writer-hub/shared'
import { FileText, PencilLine, X } from 'lucide-react'
import { useEffect } from 'react'
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
	onClose: () => void
	/** Berapa isian metadata yang sudah diisi; menentukan label tombolnya. */
	filledMetadata?: number
	onEditMetadata?: () => void
}

/**
 * Panel samping galeri: pratinjau besar, struktur bab, gaya sitasi, dan
 * caveats - catatan jujur tentang bagian format yang belum otomatis - sebelum
 * pengguna menekan "Pakai template ini" (`docs/TEMPLATE-GALLERY-PLAN.md` §6).
 *
 * Gulirannya berdiri sendiri, terpisah dari galeri di sebelahnya, dan tombol
 * pakainya berlabuh di dasar panel. Dulu keduanya satu guliran: untuk menekan
 * tombolnya, pengguna harus menggulir sepanjang seluruh grid template - makin
 * banyak templatenya, makin jauh tombolnya.
 */
export function TemplateDetailPanel({
	template,
	pending,
	error,
	onUse,
	onClose,
	filledMetadata = 0,
	onEditMetadata,
}: TemplateDetailPanelProps) {
	const { spec } = template

	useEffect(
		function closeOnEscape() {
			const onKeyDown = (event: KeyboardEvent) => {
				if (event.key === 'Escape') onClose()
			}
			window.addEventListener('keydown', onKeyDown)
			return () => window.removeEventListener('keydown', onKeyDown)
		},
		[onClose],
	)

	return (
		/*
		 * Di layar lebar ia kolom ketiga; di layar sempit ia melayang menutupi
		 * galeri. Berbagi lebar dengan grid di bawah 1024px berarti nav, grid, dan
		 * panel berebut ruang yang tidak cukup untuk ketiganya - dan yang kalah
		 * selalu grid, yang justru isi halamannya.
		 *
		 * `lg:relative`, bukan `lg:static`: tombol tutupnya berposisi mutlak, dan
		 * ia harus berlabuh pada PANEL di kedua mode. Dengan `static`, di layar
		 * lebar ia jatuh ke baris tiga kolom sebagai acuan - kebetulan mendarat di
		 * tempat yang sama karena panelnya rata kanan, dan berhenti mendarat di
		 * sana begitu ada apa pun yang menggeser tepi itu.
		 */
		<aside className="absolute inset-y-0 right-0 z-30 flex w-96 max-w-[calc(100%-2rem)] shrink-0 flex-col border-l border-line bg-surface shadow-2xl lg:relative lg:max-w-none lg:shadow-none">
			<button
				type="button"
				onClick={onClose}
				aria-label="Tutup detail template"
				title="Tutup (Esc)"
				className="absolute right-2 top-2 z-10 flex h-8 w-8 items-center justify-center rounded-lg text-muted transition-colors hover:bg-[var(--overlay-hover)] hover:text-foreground"
			>
				<X className="h-4 w-4" />
			</button>
			{/*
			 * `key` slug membuat gulirannya kembali ke atas saat template lain
			 * dipilih - tanpa itu, detail template baru terbuka di tengah-tengah,
			 * pada posisi gulir milik template sebelumnya.
			 */}
			<div key={template.slug} className="min-h-0 flex-1 overflow-y-auto">
				<div className="flex justify-center border-b border-line bg-[var(--overlay-hover)] px-6 py-6">
					<TemplatePreview
						pageSetup={spec.layout.pageSetup}
						html={contentToPreviewHtml(template.content)}
						width={240}
						className="rounded-sm"
					/>
				</div>

				<div className="flex flex-col gap-5 px-6 py-5">
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
				</div>
			</div>

			{/* Bilah aksi berlabuh: satu-satunya alasan panel ini dibuka ada di sini,
			    jadi ia tidak boleh ikut tergulir pergi. */}
			<div className="flex shrink-0 flex-col gap-2 border-t border-line px-6 py-4">
				{error && <p className="text-sm text-red-600">{error}</p>}

				{/* Opsional, dan sengaja sekunder: memaksa mengisi formulir sebelum
				    boleh mencoba template adalah gesekan di tempat yang salah. */}
				{spec.metadataFields?.length && onEditMetadata ? (
					<button
						type="button"
						onClick={onEditMetadata}
						className="flex items-center justify-center gap-1.5 rounded-xl border border-line px-5 py-2 text-sm text-muted transition-colors hover:bg-[var(--overlay-hover)] hover:text-foreground"
					>
						<PencilLine className="h-4 w-4" />
						{filledMetadata > 0 ? `Metadata terisi (${filledMetadata})` : 'Isi metadata (opsional)'}
					</button>
				) : null}

				<button
					type="button"
					onClick={onUse}
					disabled={pending}
					className="w-full rounded-xl bg-accent px-5 py-2.5 text-sm font-medium text-accent-foreground transition-colors hover:bg-accent-hover disabled:opacity-60"
				>
					{pending ? 'Membuat dokumen…' : 'Pakai template ini'}
				</button>
			</div>
		</aside>
	)
}
