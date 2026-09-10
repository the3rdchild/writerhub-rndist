'use client'

import type { DocumentMetadata, TemplateMetadataField } from '@writer-hub/shared'
import { X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { MetadataForm, MetadataScopeNote } from './metadata-form'

/**
 * Dialog pengisi metadata template.
 *
 * Nilainya disunting di draf lokal dan baru diserahkan saat "Simpan": menutup
 * lewat Batal, Esc, atau latar harus benar-benar membatalkan, bukan menyisakan
 * separuh ketikan yang terlanjur tersimpan.
 */
export function TemplateMetadataDialog({
	title,
	fields,
	values,
	afterCreation,
	saving,
	error,
	onSave,
	onClose,
}: {
	title: string
	fields: readonly TemplateMetadataField[]
	values: DocumentMetadata
	/** Dibuka dari dalam editor, bukan sebelum dokumen dibuat. */
	afterCreation: boolean
	saving?: boolean
	error?: string | null
	onSave: (next: DocumentMetadata) => void
	onClose: () => void
}) {
	const overlayRef = useRef<HTMLDivElement>(null)
	const [draft, setDraft] = useState<DocumentMetadata>(values)

	useEffect(
		function closeOnEscape() {
			const onKeyDown = (event: KeyboardEvent) => {
				if (event.key === 'Escape') onClose()
			}
			document.body.style.overflow = 'hidden'
			window.addEventListener('keydown', onKeyDown)
			return () => {
				document.body.style.overflow = ''
				window.removeEventListener('keydown', onKeyDown)
			}
		},
		[onClose],
	)

	return (
		<div
			ref={overlayRef}
			role="dialog"
			aria-modal="true"
			aria-label={title}
			className="fixed inset-0 z-[80] flex animate-in items-center justify-center bg-black/60 p-4 backdrop-blur-sm fade-in duration-200"
			onClick={(event) => {
				if (event.target === overlayRef.current) onClose()
			}}
		>
			<div className="flex max-h-full w-full max-w-lg animate-in flex-col rounded-2xl border border-line-strong bg-surface-raised shadow-2xl zoom-in-95 duration-200">
				<div className="flex shrink-0 items-start justify-between gap-3 px-5 pt-5 pb-3">
					<h2 className="font-semibold text-base text-foreground">{title}</h2>
					<button
						type="button"
						aria-label="Tutup"
						onClick={onClose}
						className="-mr-1 -mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted transition-colors hover:bg-[var(--overlay-hover)] hover:text-foreground"
					>
						<X className="h-[18px] w-[18px]" />
					</button>
				</div>

				<div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-5 pb-4">
					<MetadataScopeNote afterCreation={afterCreation} />
					<MetadataForm fields={fields} values={draft} onChange={setDraft} />
				</div>

				<div className="flex shrink-0 items-center justify-end gap-2 border-line border-t px-5 py-4">
					{error && <p className="mr-auto text-red-500 text-xs">{error}</p>}
					<button
						type="button"
						onClick={onClose}
						className="rounded-lg px-3 py-1.5 text-muted text-sm transition-colors hover:bg-[var(--overlay-hover)] hover:text-foreground"
					>
						Batal
					</button>
					<button
						type="button"
						disabled={saving}
						onClick={() => onSave(draft)}
						className="rounded-lg bg-accent px-4 py-1.5 font-medium text-accent-foreground text-sm transition-colors hover:bg-accent-hover disabled:opacity-60"
					>
						{saving ? 'Menyimpan…' : 'Simpan'}
					</button>
				</div>
			</div>
		</div>
	)
}
