'use client'

import { ArrowLeft, LibraryBig } from 'lucide-react'
import Link from 'next/link'
import { DocumentGrid } from '@/components/library/document-grid'

/**
 * File Library: semua dokumen yang sudah tersimpan di cloud.
 *
 * Halaman berdiri sendiri dengan kepala sendiri (pola `app/share/[token]`),
 * bukan di dalam AppShell - editor dan daftarnya menjawab dua pertanyaan yang
 * berbeda, dan masing-masing layak mendapat layar penuh.
 */
export default function LibraryPage() {
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
				<div className="flex items-center gap-2">
					<LibraryBig className="h-5 w-5 text-muted" />
					<h1 className="text-base font-medium text-foreground">Library</h1>
				</div>
			</header>

			<main className="flex-1 overflow-y-auto px-6 py-6">
				<DocumentGrid />
			</main>
		</div>
	)
}
