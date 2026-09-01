'use client'

import { FileText } from 'lucide-react'
import Link from 'next/link'
import { useOpenDraft } from '@/features/drafts/use-open-draft'

/**
 * Halaman antara untuk tautan `/d/<documentId>` yang dibagikan klien eksternal:
 * menunggu drafnya selesai ditulis, lalu melempar penggunanya ke editor.
 */
export function DraftOpenView({ documentId }: { documentId: string }) {
	const { phase, title, message, openAnyway } = useOpenDraft(documentId)

	if (phase === 'error') {
		return (
			<div className="flex min-h-screen flex-col items-center justify-center bg-background px-6 text-center">
				<FileText className="h-12 w-12 text-faint" />
				<h1 className="mt-4 text-lg font-medium text-foreground">{title || 'Draf belum bisa dibuka'}</h1>
				<p className="mt-1 max-w-md text-sm text-muted">{message}</p>
				<div className="mt-6 flex items-center gap-3">
					<button
						type="button"
						onClick={openAnyway}
						className="rounded-xl bg-accent px-5 py-2 text-sm font-medium text-accent-foreground transition-colors hover:bg-accent-hover"
					>
						Buka dokumennya
					</button>
					<Link
						href="/library"
						className="rounded-xl px-5 py-2 text-sm font-medium text-muted transition-colors hover:bg-[var(--overlay-hover)] hover:text-foreground"
					>
						Ke Library
					</Link>
				</div>
			</div>
		)
	}

	return (
		<div className="flex min-h-screen flex-col items-center justify-center bg-background px-6 text-center">
			<div className="h-8 w-8 animate-spin rounded-full border-2 border-accent border-t-transparent" />
			<h1 className="mt-4 text-lg font-medium text-foreground">{title || 'Menyiapkan draf'}</h1>
			<p className="mt-1 max-w-md text-sm text-muted">
				{phase === 'opening' ? 'Membuka dokumen di editor…' : 'Draf sedang ditulis, sebentar lagi siap…'}
			</p>
		</div>
	)
}
